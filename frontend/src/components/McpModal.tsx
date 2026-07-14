import { useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, message } from 'antd';
import { createMcpServer, updateMcpServer } from '../services/api';
import type { McpServer, McpServerCreate, McpServerUpdate } from '../services/api';

const { TextArea } = Input;

interface McpModalProps {
  open: boolean;
  server: McpServer | null; // null = create mode
  onClose: () => void;
  onSuccess: () => void;
}

export default function McpModal({ open, server, onClose, onSuccess }: McpModalProps) {
  const [form] = Form.useForm();
  const isEdit = !!server;

  useEffect(() => {
    if (open) {
      if (server) {
        form.setFieldsValue({
          name: server.name,
          url: server.url,
          transport: server.transport,
          headers: server.headers,
          timeout: server.timeout,
          sse_read_timeout: server.sse_read_timeout,
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          transport: 'streamable_http',
          headers: '{}',
          timeout: 60,
          sse_read_timeout: 50,
        });
      }
    }
  }, [open, server, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (isEdit) {
        const payload: McpServerUpdate = {
          name: values.name,
          url: values.url,
          transport: values.transport,
          headers: values.headers,
          timeout: values.timeout,
          sse_read_timeout: values.sse_read_timeout,
        };
        await updateMcpServer(server!.id, payload);
        message.success('MCP Server updated');
      } else {
        const payload: McpServerCreate = {
          name: values.name,
          url: values.url,
          transport: values.transport,
          headers: values.headers,
          timeout: values.timeout,
          sse_read_timeout: values.sse_read_timeout,
        };
        await createMcpServer(payload);
        message.success('MCP Server created');
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return; // form validation error
      message.error('Operation failed');
    }
  };

  return (
    <Modal
      title={isEdit ? 'Edit MCP Server' : 'Add MCP Server'}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText={isEdit ? 'Save' : 'Create'}
      cancelText="Cancel"
      width={560}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="name"
          label="Name"
          rules={[{ required: true, message: 'Please enter a name' }]}
        >
          <Input placeholder="e.g. jenkins-mcp-server" />
        </Form.Item>

        <Form.Item
          name="url"
          label="URL"
          rules={[{ required: true, message: 'Please enter the MCP endpoint URL' }]}
        >
          <Input placeholder="e.g. http://10.10.11.194:9887/mcp" />
        </Form.Item>

        <Form.Item name="transport" label="Transport">
          <Select>
            <Select.Option value="streamable_http">streamable_http</Select.Option>
            <Select.Option value="sse">sse</Select.Option>
            <Select.Option value="stdio">stdio</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="headers"
          label="Headers (JSON)"
          rules={[
            {
              validator: (_, value) => {
                try {
                  JSON.parse(value || '{}');
                  return Promise.resolve();
                } catch {
                  return Promise.reject(new Error('Invalid JSON'));
                }
              },
            },
          ]}
        >
          <TextArea rows={3} placeholder='{"Authorization": "Bearer xxx"}' />
        </Form.Item>

        <div style={{ display: 'flex', gap: 16 }}>
          <Form.Item name="timeout" label="Timeout (s)" style={{ flex: 1 }}>
            <InputNumber min={1} max={300} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="sse_read_timeout" label="SSE Read Timeout (s)" style={{ flex: 1 }}>
            <InputNumber min={1} max={300} style={{ width: '100%' }} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
