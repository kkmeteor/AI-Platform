import { useState, useRef, useCallback } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { uploadSkill } from '../services/api';

const { TextArea } = Input;

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormValues {
  name: string;
  description?: string;
  author?: string;
  version?: string;
  tags?: string;
}

export default function UploadModal({ open, onClose, onSuccess }: UploadModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!selectedFile) {
        message.warning('请上传文件');
        return;
      }

      setLoading(true);

      // 读取文件为 base64
      const arrayBuffer = await selectedFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      await uploadSkill({
        name: values.name,
        description: values.description,
        author: values.author,
        version: values.version,
        tags: values.tags,
        file_base64: base64,
        file_name: selectedFile.name,
      });

      message.success('上传成功');
      form.resetFields();
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onSuccess();
      onClose();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return;
      }
      console.error('Upload error:', err);
      message.error('上传失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith('.zip')) {
      setSelectedFile(file);
    } else {
      message.warning('只支持 .zip 文件');
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  return (
    <Modal
      title="上传 Skill"
      open={open}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="上传"
      cancelText="取消"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="name"
          label="名称"
          rules={[{ required: true, message: '请输入 Skill 名称' }]}
        >
          <Input placeholder="输入 Skill 名称" />
        </Form.Item>

        <Form.Item name="description" label="描述">
          <TextArea rows={3} placeholder="输入描述" />
        </Form.Item>

        <Form.Item name="author" label="作者">
          <Input placeholder="输入作者名称" />
        </Form.Item>

        <Form.Item name="version" label="版本">
          <Input placeholder="例如: 1.0.0" />
        </Form.Item>

        <Form.Item name="tags" label="标签">
          <Input placeholder="用逗号分隔，例如: tool,ai,helper" />
        </Form.Item>

        <Form.Item label="文件" required>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            style={{
              border: `2px dashed ${isDragOver ? '#1890ff' : '#d9d9d9'}`,
              borderRadius: 8,
              padding: '32px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: isDragOver ? '#e6f7ff' : '#fafafa',
              transition: 'all 0.3s',
            }}
          >
            <input
              type="file"
              accept=".zip"
              ref={fileInputRef}
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              style={{ display: 'none' }}
            />
            <InboxOutlined style={{ fontSize: 48, color: '#1890ff' }} />
            <p style={{ margin: '8px 0', fontSize: 16 }}>点击或拖拽 .zip 文件到此处上传</p>
            {selectedFile && (
              <p style={{ margin: 0, color: '#52c41a' }}>已选择: {selectedFile.name}</p>
            )}
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
}
