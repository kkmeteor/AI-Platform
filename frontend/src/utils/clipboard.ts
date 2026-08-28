/**
 * 跨环境剪贴板复制工具。
 *
 * 背景：Clipboard API 仅在安全上下文（HTTPS / localhost）中保证可用；HTTP 内网
 * 部署下取决于浏览器版本，且 iframe 嵌入时受外层 allow="clipboard-write" 权限
 * 策略限制。document.execCommand('copy') 虽已废弃，但主流浏览器仍保留实现，
 * 不过某些受限环境（如 iframe 权限不足）会"返回 true 但实际未写入"，即假成功。
 *
 * 策略：优先 Clipboard API → execCommand 兜底（监听 copy 事件验证写入是否真实
 * 生效）→ 全部失败返回 'unsupported'，由调用方提供手动复制兜底 UI。
 */

export type CopyResult = 'success' | 'unsupported';

export async function copyToClipboard(text: string): Promise<CopyResult> {
  // 1. Async Clipboard API（需用户手势触发，按钮点击满足）
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'success';
    } catch (err) {
      // 权限被拒 / iframe 策略限制等，继续降级；打印诊断信息便于排查
      console.warn('[clipboard] Clipboard API 写入失败：', err, {
        inIframe: window.top !== window.self,
        isSecureContext: window.isSecureContext,
      });
    }
  }

  // 2. execCommand 兜底（旧版浏览器 / 未暴露 Clipboard API 的环境）
  return legacyCopy(text) ? 'success' : 'unsupported';
}

/**
 * execCommand 兜底实现。
 * 通过监听 copy 事件确认复制流程真实执行：受限环境下 execCommand 可能返回 true
 * 但什么都不做，此时 copy 事件不会携带可写的 clipboardData，据此识别假成功。
 */
function legacyCopy(text: string): boolean {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  textArea.setSelectionRange(0, textArea.value.length);

  let copyEventHandled = false;
  const handleCopy = (event: ClipboardEvent) => {
    copyEventHandled = true;
    event.clipboardData?.setData('text/plain', text);
    event.preventDefault();
  };
  document.addEventListener('copy', handleCopy);
  // execCommand 已废弃但浏览器仍保留实现；类型断言消除 IDE 的 deprecated 提示
  const execCommand = document.execCommand as (command: string) => boolean;
  const ok = execCommand.call(document, 'copy');
  document.removeEventListener('copy', handleCopy);
  document.body.removeChild(textArea);
  return ok && copyEventHandled;
}
