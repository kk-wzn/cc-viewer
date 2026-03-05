import React, { useState, useEffect, useCallback } from 'react';
import { List, Button, Input, Empty, Typography, Space, Card, Popconfirm, message, Spin, Modal, Tag } from 'antd';
import { FolderOpenOutlined, FolderOutlined, DeleteOutlined, PlusOutlined, RocketOutlined, ClockCircleOutlined, DatabaseOutlined, ArrowUpOutlined, BranchesOutlined } from '@ant-design/icons';
import { t } from '../i18n';

const { Text, Title } = Typography;

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('ui.workspaces.justNow');
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// 目录浏览器 Modal
function DirBrowser({ open, onClose, onSelect }) {
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState(null);
  const [dirs, setDirs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pathInput, setPathInput] = useState('');

  const browse = useCallback((path) => {
    setLoading(true);
    const url = path ? `/api/browse-dir?path=${encodeURIComponent(path)}` : '/api/browse-dir';
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          message.error(data.error);
        } else {
          setCurrentPath(data.current);
          setParentPath(data.parent);
          setDirs(data.dirs || []);
          setPathInput(data.current);
        }
        setLoading(false);
      })
      .catch(() => {
        message.error('Failed to browse directory');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (open) browse('');
  }, [open, browse]);

  const handleGoTo = () => {
    const p = pathInput.trim();
    if (p) browse(p);
  };

  return (
    <Modal
      title={t('ui.workspaces.selectDir')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      styles={{ body: { padding: '12px 0' } }}
    >
      {/* 当前路径 + 上级按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 10px', borderBottom: '1px solid #2a2a2a' }}>
        <Button
          type="text"
          icon={<ArrowUpOutlined />}
          disabled={!parentPath}
          onClick={() => parentPath && browse(parentPath)}
          size="small"
        />
        <Text style={{ color: '#e0e0e0', fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <FolderOpenOutlined style={{ marginRight: 6, color: '#1668dc' }} />
          {currentPath}
        </Text>
      </div>

      {/* 目录列表 */}
      <div style={{ maxHeight: 400, overflowY: 'auto', padding: '4px 0' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : dirs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Text type="secondary">{t('ui.workspaces.emptyDir')}</Text>
          </div>
        ) : (
          dirs.map(dir => (
            <div
              key={dir.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
                onClick={() => browse(dir.path)}
              >
                <FolderOutlined style={{ color: dir.hasGit ? '#1668dc' : '#666', fontSize: 16, flexShrink: 0 }} />
                <Text style={{ color: '#d0d0d0', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {dir.name}
                </Text>
                {dir.hasGit && (
                  <Tag color="blue" style={{ fontSize: 11, lineHeight: '18px', padding: '0 4px', margin: 0, flexShrink: 0 }}>
                    <BranchesOutlined style={{ marginRight: 2 }} />git
                  </Tag>
                )}
              </div>
              <Button
                type="primary"
                size="small"
                onClick={(e) => { e.stopPropagation(); onSelect(dir.path); }}
              >
                {t('ui.workspaces.select')}
              </Button>
            </div>
          ))
        )}
      </div>

      {/* 也可以选择当前目录 */}
      <div style={{ borderTop: '1px solid #2a2a2a', padding: '10px 16px 4px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button
          type="primary"
          ghost
          block
          icon={<FolderOpenOutlined />}
          onClick={() => onSelect(currentPath)}
        >
          {t('ui.workspaces.selectCurrent')} — {currentPath.split('/').pop() || currentPath}
        </Button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            size="small"
            value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            onPressEnter={handleGoTo}
            placeholder={t('ui.workspaces.pathPlaceholder')}
            style={{ flex: 1 }}
          />
          <Button size="small" onClick={handleGoTo}>{t('ui.workspaces.goTo')}</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function WorkspaceList({ onLaunch }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(null);
  const [browseOpen, setBrowseOpen] = useState(false);

  const fetchWorkspaces = () => {
    fetch('/api/workspaces')
      .then(res => res.json())
      .then(data => {
        setWorkspaces(data.workspaces || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const handleAddFromBrowser = (path) => {
    setBrowseOpen(false);
    fetch('/api/workspaces/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          message.error(data.error);
        } else {
          fetchWorkspaces();
        }
      })
      .catch(() => message.error('Failed to add workspace'));
  };

  const handleRemove = (id) => {
    fetch(`/api/workspaces/${id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(() => fetchWorkspaces())
      .catch(() => {});
  };

  const handleLaunch = (workspace) => {
    setLaunching(workspace.id);
    fetch('/api/workspaces/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: workspace.path }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          message.error(data.error);
          setLaunching(null);
        } else {
          onLaunch({ projectName: data.projectName, path: workspace.path });
        }
      })
      .catch(() => {
        message.error('Launch failed');
        setLaunching(null);
      });
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      justifyContent: 'center',
      paddingTop: 60,
    }}>
      <div style={{ width: '100%', maxWidth: 720, padding: '0 24px' }}>
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <Title level={3} style={{ color: '#e0e0e0', margin: 0 }}>
            <FolderOpenOutlined style={{ marginRight: 8, color: '#1668dc' }} />
            {t('ui.workspaces.title')}
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{t('ui.workspaces.subtitle')}</Text>
        </div>

        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setBrowseOpen(true)}
            size="large"
          >
            {t('ui.workspaces.browse')}
          </Button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin />
          </div>
        ) : workspaces.length === 0 ? (
          <Empty
            description={<Text type="secondary">{t('ui.workspaces.empty')}</Text>}
            style={{ marginTop: 60 }}
          />
        ) : (
          <List
            dataSource={workspaces}
            renderItem={item => (
              <Card
                key={item.id}
                size="small"
                style={{
                  marginBottom: 10,
                  background: '#141414',
                  borderColor: '#2a2a2a',
                  cursor: 'pointer',
                }}
                hoverable
                onClick={() => handleLaunch(item)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Text strong style={{ color: '#e0e0e0', fontSize: 15 }}>{item.projectName}</Text>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12, wordBreak: 'break-all' }}>{item.path}</Text>
                    <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, color: '#666' }}>
                      <span><ClockCircleOutlined style={{ marginRight: 4 }} />{timeAgo(item.lastUsed)}</span>
                      {item.logCount > 0 && (
                        <span><DatabaseOutlined style={{ marginRight: 4 }} />{item.logCount} logs ({formatSize(item.totalSize)})</span>
                      )}
                    </div>
                  </div>
                  <Space>
                    <Button
                      type="primary"
                      icon={<RocketOutlined />}
                      loading={launching === item.id}
                      onClick={(e) => { e.stopPropagation(); handleLaunch(item); }}
                    >
                      {t('ui.workspaces.open')}
                    </Button>
                    <Popconfirm
                      title={t('ui.workspaces.confirmRemove')}
                      onConfirm={(e) => { e?.stopPropagation(); handleRemove(item.id); }}
                      onCancel={(e) => e?.stopPropagation()}
                      okText="Yes"
                      cancelText="No"
                    >
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            )}
          />
        )}
      </div>

      <DirBrowser
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        onSelect={handleAddFromBrowser}
      />
    </div>
  );
}
