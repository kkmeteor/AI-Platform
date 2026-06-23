import { useState, useEffect, useCallback, useRef } from 'react';
import { Input, Button, Row, Col, Spin, Pagination, Empty } from 'antd';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import SkillCard from '../components/SkillCard';
import UploadModal from '../components/UploadModal';
import SkillDetailModal from '../components/SkillDetailModal';
import { fetchSkills } from '../services/api';
import type { Skill } from '../services/api';

export default function MarketPlace() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSkills({ search, page, page_size: pageSize });
      setSkills(res.items || []);
      setTotal(res.total);
    } catch {
      setSkills([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, page, pageSize]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearchChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div style={{ padding: '0' }}>
      {/* Header with search and upload */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Input.Search
            placeholder="搜索 Skills..."
            allowClear
            enterButton={<SearchOutlined />}
            size="large"
            style={{ width: 320 }}
            onSearch={handleSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => setUploadOpen(true)}
          >
            上传
          </Button>
        </div>
      </div>

      {/* Content */}
      <Spin spinning={loading}>
        {skills.length === 0 && !loading ? (
          <Empty description="暂无 Skills" style={{ marginTop: 80 }} />
        ) : (
          <Row gutter={[16, 16]}>
            {skills.map((skill) => (
              <Col key={skill.id} xs={24} sm={12} md={8} lg={6}>
                <SkillCard skill={skill} onRefresh={loadData} onClick={setDetailSkill} />
              </Col>
            ))}
          </Row>
        )}
      </Spin>

      {/* Pagination */}
      {total > pageSize && (
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <Pagination
            current={page}
            total={total}
            pageSize={pageSize}
            onChange={(p) => setPage(p)}
            showSizeChanger={false}
          />
        </div>
      )}

      {/* Upload Modal */}
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={loadData}
      />

      {/* Detail Modal */}
      <SkillDetailModal
        open={!!detailSkill}
        skill={detailSkill}
        onClose={() => setDetailSkill(null)}
        onRefresh={loadData}
      />
    </div>
  );
}
