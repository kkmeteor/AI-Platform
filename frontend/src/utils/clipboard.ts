/**
 * 跨环境剪贴板复制工具。
 *
 * 注意：不要用 window.isSecureContext 作为门禁——localhost 与 HTTPS 之外的
 * HTTP 环境（如内网 Docker 部署）同样可能支持 Clipboard API（新版 Chrome
 * 在非安全上下文也提供 writeText，仅需用户手势），而 document.execCommand
 * 已废弃并在新浏览器中静默失败。
 *
 * 策略：存在即优先尝试 Clipboard API，失败后降级 execCommand 并校验返回值。
 */
export async function copyToClipboard(text: string): Promise<void> {
  // 1. Async Clipboard API（需由用户手势触发，按钮点击满足）
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // 权限被拒 / iframe 策略限制等，继续降级
    }
  }

  // 2. 降级：临时 textarea + execCommand（旧版浏览器 / 禁用 Clipboard API 的环境）
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  textArea.setSelectionRange(0, textArea.value.length);
  const ok = document.execCommand('copy');
  document.body.removeChild(textArea);
  if (!ok) {
    throw new Error('execCommand copy failed');
  }
}
