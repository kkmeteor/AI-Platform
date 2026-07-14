"""
MCP Server management router.

Provides CRUD endpoints for MCP server configurations and
dynamically discovers available tools by probing each server
via the MCP JSON-RPC protocol (streamable_http transport).
"""

import json
import logging
from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import McpServer
from app.schemas import (
    McpServerCreate,
    McpServerResponse,
    McpServerUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def require_admin(request: Request):
    """Raise 403 when the caller is not an admin."""
    role = request.headers.get("X-User-Role", "").strip().lower()
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")


async def _discover_tools(server: McpServer) -> tuple[bool, list[dict]]:
    """
    Connect to an MCP server and retrieve its tool list.

    Returns (is_active, tools_list).
    On any failure returns (False, []).
    """
    try:
        headers = json.loads(server.headers or "{}")
        headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        })
        timeout = httpx.Timeout(server.timeout, read=server.sse_read_timeout)

        async with httpx.AsyncClient(timeout=timeout) as client:
            # Step 1: initialize
            init_payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {"name": "skillmarket", "version": "1.0.0"},
                },
            }
            resp = await client.post(server.url, json=init_payload, headers=headers)
            resp.raise_for_status()

            # Extract session id from response headers (if provided)
            session_id = resp.headers.get("mcp-session-id")

            # Parse SSE response
            body = resp.text
            init_data = _parse_sse(body)
            if init_data is None:
                return False, []

            # Step 2: send initialized notification
            req_headers = dict(headers)
            if session_id:
                req_headers["Mcp-Session-Id"] = session_id

            notif_payload = {
                "jsonrpc": "2.0",
                "method": "notifications/initialized",
            }
            await client.post(server.url, json=notif_payload, headers=req_headers)

            # Step 3: tools/list
            tools_payload = {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/list",
                "params": {},
            }
            resp2 = await client.post(server.url, json=tools_payload, headers=req_headers)
            resp2.raise_for_status()

            tools_data = _parse_sse(resp2.text)
            if tools_data and "result" in tools_data:
                tools = tools_data["result"].get("tools", [])
                return True, tools

            return True, []

    except Exception as exc:
        logger.warning("Failed to discover tools from %s: %s", server.url, exc)
        return False, []


def _parse_sse(body: str) -> dict | None:
    """
    Parse an SSE response body and return the first JSON data object.
    Handles both pure JSON and SSE ``data: ...`` formats.
    """
    body = body.strip()
    if not body:
        return None

    # Try SSE format first
    for line in body.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            json_str = line[len("data:"):].strip()
            try:
                return json.loads(json_str)
            except json.JSONDecodeError:
                continue

    # Fallback: try parsing the whole body as JSON
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return None


def _server_to_response(server: McpServer, tools: list[dict] | None = None) -> McpServerResponse:
    """Convert a DB model to the response schema."""
    return McpServerResponse(
        id=server.id,
        name=server.name,
        url=server.url,
        transport=server.transport,
        headers=server.headers,
        timeout=server.timeout,
        sse_read_timeout=server.sse_read_timeout,
        is_active=server.is_active,
        tools=tools or [],
        created_at=server.created_at,
        updated_at=server.updated_at,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/mcp", response_model=List[McpServerResponse])
async def list_mcp_servers(db: Session = Depends(get_db)):
    """List all MCP servers with their tools (probed in real-time)."""
    servers = db.query(McpServer).order_by(McpServer.created_at.desc()).all()

    results = []
    for server in servers:
        is_active, tools = await _discover_tools(server)
        server.is_active = is_active
        db.commit()
        db.refresh(server)
        results.append(_server_to_response(server, tools))

    return results


@router.post("/mcp", response_model=McpServerResponse, status_code=201)
async def create_mcp_server(
    payload: McpServerCreate,
    db: Session = Depends(get_db),
):
    """Register a new MCP server configuration."""
    server = McpServer(
        name=payload.name,
        url=payload.url,
        transport=payload.transport,
        headers=payload.headers,
        timeout=payload.timeout,
        sse_read_timeout=payload.sse_read_timeout,
    )
    db.add(server)
    db.commit()
    db.refresh(server)

    # Probe tools immediately
    is_active, tools = await _discover_tools(server)
    server.is_active = is_active
    db.commit()
    db.refresh(server)

    return _server_to_response(server, tools)


@router.put("/mcp/{server_id}", response_model=McpServerResponse)
async def update_mcp_server(
    server_id: int,
    payload: McpServerUpdate,
    db: Session = Depends(get_db),
):
    """Update an existing MCP server configuration."""
    server = db.query(McpServer).filter(McpServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(server, field, value)

    db.commit()
    db.refresh(server)

    # Re-probe tools
    is_active, tools = await _discover_tools(server)
    server.is_active = is_active
    db.commit()
    db.refresh(server)

    return _server_to_response(server, tools)


@router.delete("/mcp/{server_id}")
def delete_mcp_server(
    server_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Delete an MCP server (admin only)."""
    require_admin(request)

    server = db.query(McpServer).filter(McpServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")

    db.delete(server)
    db.commit()
    return {"detail": "MCP server deleted successfully"}


@router.post("/mcp/{server_id}/refresh", response_model=McpServerResponse)
async def refresh_mcp_server(
    server_id: int,
    db: Session = Depends(get_db),
):
    """Re-probe an MCP server for its tool list."""
    server = db.query(McpServer).filter(McpServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")

    is_active, tools = await _discover_tools(server)
    server.is_active = is_active
    db.commit()
    db.refresh(server)

    return _server_to_response(server, tools)
