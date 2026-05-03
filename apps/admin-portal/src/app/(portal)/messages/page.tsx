'use client';

import { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { formatDateTime } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/i18n-context';
import {
  X,
  Send,
  Mail,
  MailOpen,
  Archive,
  CheckCheck,
  Megaphone,
  MessageSquare,
  Monitor,
  Filter,
} from 'lucide-react';
import { FilterPill } from '@/components/ui/filter-pill';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';

// ─── GraphQL ────────────────────────────────────────────────────────────────

const GET_MESSAGES = gql`
  query GetMessages(
    $filter: MessageFilterInput
    $pagination: PaginationInput
  ) {
    messages(filter: $filter, pagination: $pagination) {
      edges {
        cursor
        node {
          id
          type
          priority
          subject
          body
          senderType
          senderId
          senderName
          tenantId
          metadata
          expiresAt
          createdAt
          updatedAt
          recipients {
            id
            recipientType
            recipientId
            readAt
            archivedAt
            createdAt
          }
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;

const UNREAD_COUNT = gql`
  query UnreadMessageCount {
    unreadMessageCount
  }
`;

const SEND_MESSAGE = gql`
  mutation SendMessage($input: SendMessageInput!) {
    sendMessage(input: $input) {
      id
      subject
      type
      priority
      createdAt
    }
  }
`;

const MARK_READ = gql`
  mutation MarkMessageRead($id: ID!) {
    markMessageRead(id: $id) {
      id
      recipients {
        id
        readAt
      }
    }
  }
`;

const MARK_ALL_READ = gql`
  mutation MarkAllMessagesRead {
    markAllMessagesRead
  }
`;

const ARCHIVE_MESSAGE = gql`
  mutation ArchiveMessage($id: ID!) {
    archiveMessage(id: $id)
  }
`;

// ─── Constants ──────────────────────────────────────────────────────────────

const priorityColors: Record<string, string> = {
  low: 'bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]',
  normal: 'bg-[color:var(--accent-primary-soft)] text-[color:var(--accent-primary-deep)] border-[color:var(--accent-primary-soft)]',
  high: 'bg-[color:var(--status-warning-soft)] text-[color:var(--status-warning-text)] border-[color:var(--status-warning)]',
  urgent: 'bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)] border-[color:var(--status-error)]',
};

const typeIcons: Record<string, typeof Megaphone> = {
  announcement: Megaphone,
  direct: MessageSquare,
  system: Monitor,
};

interface MessageNode {
  id: string;
  type: string;
  priority: string;
  subject: string;
  body: string;
  senderType: string;
  senderId: string;
  senderName?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  recipients?: {
    id: string;
    recipientType: string;
    recipientId: string;
    readAt?: string;
    archivedAt?: string;
    createdAt: string;
  }[];
}

const PAGE_SIZE = 20;

export default function MessagesPage() {
  const { t } = useI18n();
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [readFilter, setReadFilter] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<MessageNode | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Compose form state (tenant can only send direct messages to platform)
  const [composePriority, setComposePriority] = useState<string>('normal');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');

  const typeOptions = [
    { value: '', label: t('messages.allTypes') },
    { value: 'announcement', label: t('messages.announcement') },
    { value: 'direct', label: t('messages.direct') },
    { value: 'system', label: t('messages.system') },
  ];

  const priorityOptions = [
    { value: '', label: t('messages.allPriorities') },
    { value: 'low', label: t('messages.low') },
    { value: 'normal', label: t('messages.normal') },
    { value: 'high', label: t('messages.high') },
    { value: 'urgent', label: t('messages.urgent') },
  ];

  const readOptions = [
    { value: '', label: t('messages.all') },
    { value: 'unread', label: t('messages.unread') },
    { value: 'read', label: t('messages.read') },
  ];

  const filterVars = {
    filter: {
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(priorityFilter ? { priority: priorityFilter } : {}),
      ...(readFilter ? { readStatus: readFilter } : {}),
    },
    pagination: { first: PAGE_SIZE, after: cursor },
  };

  const { data, loading, error, refetch } = useQuery(GET_MESSAGES, {
    variables: filterVars,
    fetchPolicy: 'cache-and-network',
  });

  const { data: unreadData, refetch: refetchUnread } = useQuery(UNREAD_COUNT, {
    pollInterval: 30000,
  });

  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE);
  const [markRead] = useMutation(MARK_READ);
  const [markAllRead, { loading: markingAll }] = useMutation(MARK_ALL_READ);
  const [archiveMessage] = useMutation(ARCHIVE_MESSAGE);

  const connection = data?.messages;
  const messages: MessageNode[] = (connection?.edges || []).map((e: any) => e.node);
  const pageInfo = connection?.pageInfo;
  const unreadCount = unreadData?.unreadMessageCount || 0;

  const isUnread = (msg: MessageNode) => {
    if (!msg.recipients || msg.recipients.length === 0) return true;
    return !msg.recipients[0].readAt;
  };

  const handleSelectMessage = async (msg: MessageNode) => {
    setSelectedMessage(msg);
    if (isUnread(msg)) {
      try {
        await markRead({ variables: { id: msg.id } });
        refetch();
        refetchUnread();
      } catch { /* ignore */ }
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead();
      setStatusMsg({ type: 'success', text: t('messages.allMarkedRead') });
      refetch();
      refetchUnread();
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `${t('messages.failed')} ${err.message}` });
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await archiveMessage({ variables: { id } });
      setStatusMsg({ type: 'success', text: t('messages.archiveSuccess') });
      if (selectedMessage?.id === id) setSelectedMessage(null);
      refetch();
      refetchUnread();
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `${t('messages.failed')} ${err.message}` });
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  const handleSend = async () => {
    if (!composeSubject.trim() || !composeBody.trim()) {
      setStatusMsg({ type: 'error', text: t('messages.subjectBodyRequired') });
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }

    try {
      await sendMessage({
        variables: {
          input: {
            type: 'direct',
            priority: composePriority,
            subject: composeSubject,
            body: composeBody,
          },
        },
      });
      setStatusMsg({ type: 'success', text: t('messages.sentSuccess') });
      setComposeOpen(false);
      resetComposeForm();
      refetch();
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `${t('messages.sendFailed')} ${err.message}` });
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  const resetComposeForm = () => {
    setComposePriority('normal');
    setComposeSubject('');
    setComposeBody('');
  };

  const TypeIcon = (type: string) => typeIcons[type] || MessageSquare;

  const priorityLabel = (p: string) => {
    const map: Record<string, string> = {
      low: t('messages.low'),
      normal: t('messages.normal'),
      high: t('messages.high'),
      urgent: t('messages.urgent'),
    };
    return map[p] || p;
  };

  const typeLabel = (tp: string) => {
    const map: Record<string, string> = {
      announcement: t('messages.announcement'),
      direct: t('messages.direct'),
      system: t('messages.system'),
    };
    return map[tp] || tp;
  };

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('eyebrow.tenantInbox')}
        title={t('nav.messages')}
        subtitle={t('messages.subtitle')}
        actions={
          <>
            {unreadCount > 0 && (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-full"
                style={{
                  backgroundColor: 'var(--status-error-soft)',
                  color: 'var(--status-error-text)',
                  border: '1px solid var(--status-error)',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: 'var(--status-error)',
                    boxShadow: '0 0 6px var(--status-error)',
                  }}
                />
                {unreadCount} {t('messages.unread').toLowerCase()}
              </span>
            )}
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="btn-secondary disabled:opacity-50"
              >
                <CheckCheck className="w-4 h-4" />
                {t('messages.markAllRead')}
              </button>
            )}
            <button
              onClick={() => setComposeOpen(true)}
              className="btn-primary"
            >
              <Send className="w-4 h-4" />
              {t('messages.contactPlatform')}
            </button>
          </>
        }
      />

      {statusMsg && (
        <div
          className="relative z-10 card-glow px-4 py-2.5 text-sm flex items-center gap-2"
          style={{
            color:
              statusMsg.type === 'success'
                ? 'var(--status-success-text)'
                : 'var(--status-error-text)',
          }}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Filters */}
      <div className="relative z-10 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)]">
          <Filter className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider">Filter</span>
        </div>
        <FilterPill
          options={typeOptions}
          value={typeFilter}
          onChange={(v) => { setTypeFilter(v); setCursor(null); }}
        />
        <FilterPill
          options={priorityOptions}
          value={priorityFilter}
          onChange={(v) => { setPriorityFilter(v); setCursor(null); }}
        />
        <FilterPill
          options={readOptions}
          value={readFilter}
          onChange={(v) => { setReadFilter(v); setCursor(null); }}
        />
        {(typeFilter || priorityFilter || readFilter) && (
          <button
            onClick={() => { setTypeFilter(''); setPriorityFilter(''); setReadFilter(''); setCursor(null); }}
            className="text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] underline-offset-2 hover:underline ml-1"
          >
            {t('messages.clearFilters')}
          </button>
        )}
      </div>

      {error && (
        <div
          className="relative z-10 px-4 py-3 rounded-lg text-sm"
          style={{
            backgroundColor: 'var(--status-error-soft)',
            color: 'var(--status-error-text)',
            border: '1px solid var(--status-error)',
          }}
        >
          {t('messages.failed')} {error.message}
        </div>
      )}

      {/* Message Table */}
      <div className="relative z-10 card-glow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] text-left">
              <th className="px-4 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">{t('messages.subject')}</th>
              <th className="px-4 py-3 font-medium">{t('messages.type')}</th>
              <th className="px-4 py-3 font-medium">{t('messages.sender')}</th>
              <th className="px-4 py-3 font-medium">{t('messages.priority')}</th>
              <th className="px-4 py-3 font-medium">{t('messages.date')}</th>
              <th className="px-4 py-3 font-medium w-12">{t('messages.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && messages.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[color:var(--text-tertiary)]">{t('messages.loading')}</td>
              </tr>
            ) : messages.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[color:var(--text-tertiary)]">{t('messages.noMessages')}</td>
              </tr>
            ) : (
              messages.map((msg) => {
                const unread = isUnread(msg);
                const Icon = TypeIcon(msg.type);
                return (
                  <tr
                    key={msg.id}
                    onClick={() => handleSelectMessage(msg)}
                    className={`border-b border-[color:var(--border-subtle)] hover:bg-[color:var(--bg-muted)] cursor-pointer transition-colors ${unread ? 'bg-[color:var(--bg-muted)]' : ''}`}
                  >
                    <td className="px-4 py-3">
                      {unread ? (
                        <Mail className="w-4 h-4 text-[color:var(--accent-primary-deep)]" />
                      ) : (
                        <MailOpen className="w-4 h-4 text-[color:var(--text-tertiary)]" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={unread ? 'text-[color:var(--text-primary)] font-medium' : 'text-[color:var(--text-primary)]'}>
                        {msg.subject}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5 text-[color:var(--text-tertiary)]" />
                        <span className="text-[color:var(--text-secondary)]">{typeLabel(msg.type)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {msg.senderName || msg.senderType}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full border ${priorityColors[msg.priority] ?? ''}`}>
                        {priorityLabel(msg.priority)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)] text-xs whitespace-nowrap">
                      {formatDateTime(msg.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleArchive(msg.id); }}
                        className="text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)] transition-colors"
                        title={t('messages.archive')}
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageInfo && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[color:var(--text-tertiary)]">
            {connection?.totalCount != null
              ? connection.totalCount === 1
                ? t('messages.messageCount', { count: connection.totalCount })
                : t('messages.messageCountPlural', { count: connection.totalCount })
              : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCursor(null)}
              disabled={!pageInfo.hasPreviousPage}
              className="glass-button text-xs disabled:opacity-30"
            >
              {t('messages.first')}
            </button>
            <button
              onClick={() => setCursor(pageInfo.endCursor)}
              disabled={!pageInfo.hasNextPage}
              className="glass-button text-xs disabled:opacity-30"
            >
              {t('messages.next')}
            </button>
          </div>
        </div>
      )}

      {/* Detail Slide-over */}
      {selectedMessage && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelectedMessage(null)} />
          <div
            className="fixed inset-y-0 right-0 w-[560px] max-w-full backdrop-blur-2xl z-50 overflow-y-auto"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderLeft: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-between p-5 border-b border-[color:var(--border-subtle)]">
              <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">{t('messages.messageDetail')}</h2>
              <button onClick={() => setSelectedMessage(null)} className="text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <h3 className="text-xl font-semibold text-[color:var(--text-primary)]">{selectedMessage.subject}</h3>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`inline-block px-2 py-0.5 text-xs rounded-full border ${priorityColors[selectedMessage.priority] ?? ''}`}>
                    {priorityLabel(selectedMessage.priority)}
                  </span>
                  <span className="text-[color:var(--text-tertiary)] text-sm">{typeLabel(selectedMessage.type)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[color:var(--text-tertiary)] block mb-1">{t('messages.from')}</span>
                  <span className="text-[color:var(--text-primary)]">{selectedMessage.senderName || selectedMessage.senderType}</span>
                </div>
                <div>
                  <span className="text-[color:var(--text-tertiary)] block mb-1">{t('messages.date')}</span>
                  <span className="text-[color:var(--text-primary)] text-xs">{formatDateTime(selectedMessage.createdAt)}</span>
                </div>
              </div>

              <div>
                <span className="text-[color:var(--text-tertiary)] block mb-1 text-sm">{t('messages.message')}</span>
                <div className="card p-4 text-[color:var(--text-primary)] text-sm whitespace-pre-wrap">{selectedMessage.body}</div>
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-[color:var(--border-subtle)]">
                <button
                  onClick={() => handleArchive(selectedMessage.id)}
                  className="glass-button flex items-center gap-2 text-sm"
                >
                  <Archive className="w-4 h-4" />
                  {t('messages.archive')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Compose Slide-over (Direct messages only for tenant) */}
      {composeOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => { setComposeOpen(false); resetComposeForm(); }} />
          <div
            className="fixed inset-y-0 right-0 w-[560px] max-w-full backdrop-blur-2xl z-50 overflow-y-auto"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderLeft: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-between p-5 border-b border-[color:var(--border-subtle)]">
              <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">{t('messages.composeTitle')}</h2>
              <button onClick={() => { setComposeOpen(false); resetComposeForm(); }} className="text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="card p-3 text-sm text-[color:var(--text-secondary)]">
                {t('messages.composeInfo')}
              </div>

              <div>
                <label className="text-sm text-[color:var(--text-tertiary)] block mb-1">{t('messages.priorityLabel')}</label>
                <select
                  className="glass-input text-sm w-full"
                  value={composePriority}
                  onChange={(e) => setComposePriority(e.target.value)}
                >
                  <option value="low">{t('messages.low')}</option>
                  <option value="normal">{t('messages.normal')}</option>
                  <option value="high">{t('messages.high')}</option>
                  <option value="urgent">{t('messages.urgent')}</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-[color:var(--text-tertiary)] block mb-1">{t('messages.subjectLabel')}</label>
                <input
                  type="text"
                  className="glass-input text-sm w-full"
                  placeholder={t('messages.subjectPlaceholder')}
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm text-[color:var(--text-tertiary)] block mb-1">{t('messages.bodyLabel')}</label>
                <textarea
                  className="glass-input text-sm w-full min-h-[200px] resize-y"
                  placeholder={t('messages.bodyPlaceholder')}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-[color:var(--border-subtle)]">
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="glass-button-primary flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {sending ? t('messages.sending') : t('messages.sendMessage')}
                </button>
                <button
                  onClick={() => { setComposeOpen(false); resetComposeForm(); }}
                  className="glass-button text-sm"
                >
                  {t('messages.cancel')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
