'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { gql, useQuery, useMutation } from '@apollo/client';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDateTime } from '@/lib/utils';
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
  Plus,
  Inbox,
  Check,
} from 'lucide-react';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { MetricCard } from '@/components/ui/metric-card';
import { FilterPill } from '@/components/ui/filter-pill';
import { SlideOver } from '@/components/ui/slide-over';

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

const TENANTS_FOR_PICKER = gql`
  query TenantsForPicker {
    tenants(pagination: { first: 100 }) {
      edges {
        node {
          id
          name
          slug
          country
          status
        }
      }
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

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'direct', label: 'Direct' },
  { value: 'system', label: 'System' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'Any priority' },
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const READ_OPTIONS = [
  { value: '', label: 'Read & unread' },
  { value: 'unread', label: 'Unread only' },
  { value: 'read', label: 'Read only' },
];

const PRIORITY_COLOR: Record<string, { bg: string; fg: string; border: string; label: string }> = {
  low: {
    bg: 'var(--bg-muted)',
    fg: 'var(--text-secondary)',
    border: 'var(--border-subtle)',
    label: 'Low',
  },
  normal: {
    bg: 'var(--accent-primary-soft)',
    fg: 'var(--accent-primary-deep)',
    border: 'var(--accent-primary-soft)',
    label: 'Normal',
  },
  high: {
    bg: 'var(--status-warning-soft)',
    fg: 'var(--status-warning-text)',
    border: 'var(--status-warning)',
    label: 'High',
  },
  urgent: {
    bg: 'var(--status-error-soft)',
    fg: 'var(--status-error-text)',
    border: 'var(--status-error)',
    label: 'Urgent',
  },
};

const TYPE_ICON: Record<string, typeof Megaphone> = {
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

// ─── Page ───────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [readFilter, setReadFilter] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<MessageNode | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Compose form state
  const [composeType, setComposeType] = useState<string>('announcement');
  const [composePriority, setComposePriority] = useState<string>('normal');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeTenantId, setComposeTenantId] = useState('');
  const [tenantSearch, setTenantSearch] = useState('');
  const [selectedTenantName, setSelectedTenantName] = useState('');
  const [tenantPickerOpen, setTenantPickerOpen] = useState(false);
  const tenantPickerRef = useRef<HTMLDivElement>(null);
  const tenantInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        tenantPickerRef.current &&
        !tenantPickerRef.current.contains(target) &&
        !(target as HTMLElement).closest?.('[data-tenant-dropdown]')
      ) {
        setTenantPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (tenantPickerOpen && tenantInputRef.current) {
      const rect = tenantInputRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, [tenantPickerOpen, tenantSearch]);

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

  const { data: tenantsData, error: tenantsError, loading: tenantsLoading } = useQuery(TENANTS_FOR_PICKER);
  const tenantOptions: { id: string; name: string; slug: string; country: string; status: string }[] =
    tenantsData?.tenants?.edges?.map((e: any) => e.node) || [];

  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE);
  const [markRead] = useMutation(MARK_READ);
  const [markAllRead, { loading: markingAll }] = useMutation(MARK_ALL_READ);
  const [archiveMessage] = useMutation(ARCHIVE_MESSAGE);

  const connection = data?.messages;
  const messages: MessageNode[] = (connection?.edges || []).map((e: any) => e.node);
  const pageInfo = connection?.pageInfo;
  const unreadCount = unreadData?.unreadMessageCount || 0;
  const totalCount = connection?.totalCount ?? 0;

  const isUnread = (msg: MessageNode) => {
    if (!msg.recipients || msg.recipients.length === 0) return true;
    return !msg.recipients[0].readAt;
  };

  const stats = useMemo(() => {
    const announcements = messages.filter((m) => m.type === 'announcement').length;
    const direct = messages.filter((m) => m.type === 'direct').length;
    const system = messages.filter((m) => m.type === 'system').length;
    const urgent = messages.filter((m) => m.priority === 'urgent' || m.priority === 'high').length;
    return { announcements, direct, system, urgent };
  }, [messages]);

  const handleSelectMessage = async (msg: MessageNode) => {
    setSelectedMessage(msg);
    if (isUnread(msg)) {
      try {
        await markRead({ variables: { id: msg.id } });
        refetch();
        refetchUnread();
      } catch {
        /* ignore */
      }
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead();
      setStatusMsg({ type: 'success', text: 'All messages marked as read' });
      refetch();
      refetchUnread();
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Failed: ${err.message}` });
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await archiveMessage({ variables: { id } });
      setStatusMsg({ type: 'success', text: 'Message archived' });
      if (selectedMessage?.id === id) setSelectedMessage(null);
      refetch();
      refetchUnread();
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Failed: ${err.message}` });
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  const handleSend = async () => {
    if (!composeSubject.trim() || !composeBody.trim()) {
      setStatusMsg({ type: 'error', text: 'Subject and body are required' });
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }
    if (composeType === 'direct' && !composeTenantId) {
      setStatusMsg({ type: 'error', text: 'Pick a recipient SP for direct messages' });
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }
    try {
      await sendMessage({
        variables: {
          input: {
            type: composeType,
            priority: composePriority,
            subject: composeSubject,
            body: composeBody,
            ...(composeTenantId ? { tenantId: composeTenantId } : {}),
          },
        },
      });
      setStatusMsg({ type: 'success', text: 'Message sent successfully' });
      setComposeOpen(false);
      resetComposeForm();
      refetch();
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Failed to send: ${err.message}` });
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  const resetComposeForm = () => {
    setComposeType('announcement');
    setComposePriority('normal');
    setComposeSubject('');
    setComposeBody('');
    setComposeTenantId('');
    setTenantSearch('');
    setSelectedTenantName('');
    setTenantPickerOpen(false);
  };

  const filtersActive = Boolean(typeFilter || priorityFilter || readFilter);

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      {/* Header */}
      <header className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="live-dot" aria-hidden />
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
              Live · Operator inbox
            </span>
          </div>
          <h1
            className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]"
            style={{ fontSize: 44, lineHeight: 1.05 }}
          >
            Messages
          </h1>
          <p className="text-[15px] text-[color:var(--text-secondary)] mt-2 max-w-[60ch]">
            Broadcast platform-wide announcements or message a single tenant.
            {unreadCount > 0 && (
              <span
                className="ml-3 inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-full"
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
                {unreadCount} unread
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="btn-secondary disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </button>
          )}
          <button onClick={() => setComposeOpen(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Compose
          </button>
        </div>
      </header>

      {/* KPI strip */}
      <section className="relative z-10 stagger-children grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          variant="glow"
          title="Inbox"
          value={totalCount}
          subtitle={`${unreadCount} unread`}
          icon={<Inbox className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title="Announcements"
          value={stats.announcements}
          subtitle="Cross-tenant"
          icon={<Megaphone className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title="Direct"
          value={stats.direct}
          subtitle="To single tenant"
          icon={<MessageSquare className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title="Urgent / High"
          value={stats.urgent}
          subtitle="Needs attention"
          icon={<Megaphone className="w-4 h-4" />}
          live={stats.urgent > 0}
        />
      </section>

      {/* Status toast */}
      <AnimatePresence>
        {statusMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="relative z-10 card-glow px-4 py-2.5 text-sm flex items-center gap-2"
            style={{
              color:
                statusMsg.type === 'success'
                  ? 'var(--status-success-text)'
                  : 'var(--status-error-text)',
            }}
          >
            {statusMsg.type === 'success' ? (
              <Check className="w-4 h-4" />
            ) : (
              <X className="w-4 h-4" />
            )}
            {statusMsg.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter bar — compact pills, auto-width, inline */}
      <section className="relative z-10 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)]">
          <Filter className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider">Filter</span>
        </div>
        <FilterPill
          options={TYPE_OPTIONS}
          value={typeFilter}
          onChange={(v) => {
            setTypeFilter(v);
            setCursor(null);
          }}
        />
        <FilterPill
          options={PRIORITY_OPTIONS}
          value={priorityFilter}
          onChange={(v) => {
            setPriorityFilter(v);
            setCursor(null);
          }}
        />
        <FilterPill
          options={READ_OPTIONS}
          value={readFilter}
          onChange={(v) => {
            setReadFilter(v);
            setCursor(null);
          }}
        />
        {filtersActive && (
          <button
            onClick={() => {
              setTypeFilter('');
              setPriorityFilter('');
              setReadFilter('');
              setCursor(null);
            }}
            className="text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] ml-1 underline-offset-2 hover:underline"
          >
            Clear
          </button>
        )}
      </section>

      {/* Error */}
      {error && (
        <div
          className="relative z-10 px-4 py-3 rounded-lg text-sm"
          style={{
            backgroundColor: 'var(--status-error-soft)',
            color: 'var(--status-error-text)',
            border: '1px solid var(--status-error)',
          }}
        >
          Failed to load messages: {error.message}
        </div>
      )}

      {/* Message table */}
      <section className="relative z-10 card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)]">
                <Th className="w-8" />
                <Th>Subject</Th>
                <Th>Type</Th>
                <Th>Sender</Th>
                <Th>Priority</Th>
                <Th>Date</Th>
                <Th className="w-12">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading && messages.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[color:var(--text-tertiary)]">
                    Loading…
                  </td>
                </tr>
              ) : messages.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <Inbox className="w-8 h-8 mx-auto text-[color:var(--text-tertiary)] mb-3" />
                    <p className="text-sm text-[color:var(--text-secondary)]">
                      {filtersActive ? 'No messages match these filters.' : 'No messages yet.'}
                    </p>
                  </td>
                </tr>
              ) : (
                messages.map((msg, i) => {
                  const unread = isUnread(msg);
                  const Icon = TYPE_ICON[msg.type] ?? MessageSquare;
                  const pri = PRIORITY_COLOR[msg.priority];
                  return (
                    <tr
                      key={msg.id}
                      onClick={() => handleSelectMessage(msg)}
                      className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] cursor-pointer transition-colors"
                      style={{
                        animationDelay: `${Math.min(i, 12) * 25}ms`,
                        ...(unread
                          ? { boxShadow: 'inset 3px 0 0 var(--accent-primary)' }
                          : {}),
                      }}
                    >
                      <Td>
                        {unread ? (
                          <Mail className="w-4 h-4 text-[color:var(--accent-primary-deep)]" />
                        ) : (
                          <MailOpen className="w-4 h-4 text-[color:var(--text-tertiary)]" />
                        )}
                      </Td>
                      <Td>
                        <span
                          className={
                            unread
                              ? 'text-[color:var(--text-primary)] font-semibold'
                              : 'text-[color:var(--text-primary)]'
                          }
                        >
                          {msg.subject}
                        </span>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5 text-[color:var(--text-tertiary)]" />
                          <span className="text-[color:var(--text-secondary)] capitalize">
                            {msg.type}
                          </span>
                        </div>
                      </Td>
                      <Td>
                        <span className="text-[color:var(--text-secondary)]">
                          {msg.senderName || msg.senderType}
                        </span>
                      </Td>
                      <Td>
                        {pri && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                            style={{
                              backgroundColor: pri.bg,
                              color: pri.fg,
                              border: `1px solid ${pri.border}`,
                            }}
                          >
                            {pri.label}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <span className="text-[color:var(--text-tertiary)] text-[12px] tabular-nums whitespace-nowrap">
                          {formatDateTime(msg.createdAt)}
                        </span>
                      </Td>
                      <Td>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchive(msg.id);
                          }}
                          className="text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors p-1 rounded hover:bg-[color:var(--bg-hover)]"
                          title="Archive"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pagination */}
      {pageInfo && messages.length > 0 && (
        <div className="relative z-10 flex items-center justify-between text-sm">
          <span className="text-[color:var(--text-tertiary)] tabular-nums">
            {totalCount} message{totalCount === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCursor(null)}
              disabled={!pageInfo.hasPreviousPage}
              className="btn-ghost text-xs disabled:opacity-30"
            >
              First
            </button>
            <button
              onClick={() => setCursor(pageInfo.endCursor)}
              disabled={!pageInfo.hasNextPage}
              className="btn-secondary text-xs disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail slide-over */}
      <AnimatePresence>
        {selectedMessage && (
          <SlideOver
            title="Message detail"
            onClose={() => setSelectedMessage(null)}
            footer={
              <button
                onClick={() => handleArchive(selectedMessage.id)}
                className="btn-secondary"
              >
                <Archive className="w-4 h-4" />
                Archive
              </button>
            }
          >
            <div className="space-y-5">
              <div>
                <h3 className="text-[20px] font-semibold tracking-tight text-[color:var(--text-primary)] leading-snug">
                  {selectedMessage.subject}
                </h3>
                <div className="flex items-center gap-3 mt-3">
                  {(() => {
                    const pri = PRIORITY_COLOR[selectedMessage.priority];
                    return pri ? (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                        style={{
                          backgroundColor: pri.bg,
                          color: pri.fg,
                          border: `1px solid ${pri.border}`,
                        }}
                      >
                        {pri.label}
                      </span>
                    ) : null;
                  })()}
                  <span className="text-[12px] text-[color:var(--text-tertiary)] capitalize flex items-center gap-1.5">
                    {(() => {
                      const Icon = TYPE_ICON[selectedMessage.type] ?? MessageSquare;
                      return <Icon className="w-3.5 h-3.5" />;
                    })()}
                    {selectedMessage.type}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm pt-3 border-t border-[color:var(--border-subtle)]">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] block mb-1">
                    From
                  </span>
                  <span className="text-[color:var(--text-primary)]">
                    {selectedMessage.senderName || selectedMessage.senderType}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] block mb-1">
                    Date
                  </span>
                  <span className="text-[color:var(--text-primary)] text-[12px] tabular-nums">
                    {formatDateTime(selectedMessage.createdAt)}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] block mb-2">
                  Message
                </span>
                <div
                  className="p-4 rounded-lg text-[14px] leading-relaxed whitespace-pre-wrap text-[color:var(--text-primary)]"
                  style={{
                    backgroundColor: 'var(--bg-muted)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {selectedMessage.body}
                </div>
              </div>
            </div>
          </SlideOver>
        )}
      </AnimatePresence>

      {/* Compose slide-over */}
      <AnimatePresence>
        {composeOpen && (
          <SlideOver
            title="Compose message"
            onClose={() => {
              setComposeOpen(false);
              resetComposeForm();
            }}
            footer={
              <>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="btn-primary disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {sending ? 'Sending…' : 'Send message'}
                </button>
                <button
                  onClick={() => {
                    setComposeOpen(false);
                    resetComposeForm();
                  }}
                  className="btn-ghost"
                >
                  Cancel
                </button>
              </>
            }
          >
            <div className="space-y-4">
              <Field label="Type">
                <select
                  className="input-field"
                  value={composeType}
                  onChange={(e) => setComposeType(e.target.value)}
                >
                  <option value="announcement">Announcement (all tenants)</option>
                  <option value="direct">Direct (specific tenant)</option>
                  <option value="system">System</option>
                </select>
              </Field>

              {composeType === 'direct' && (
                <div className="relative" ref={tenantPickerRef}>
                  <Field label="Recipient SP">
                    <input
                      ref={tenantInputRef}
                      type="text"
                      className="input-field"
                      placeholder="Search by SP name or slug…"
                      value={selectedTenantName || tenantSearch}
                      onChange={(e) => {
                        setTenantSearch(e.target.value);
                        setSelectedTenantName('');
                        setComposeTenantId('');
                        setTenantPickerOpen(true);
                      }}
                      onFocus={() => setTenantPickerOpen(true)}
                    />
                  </Field>
                  {tenantPickerOpen && tenantSearch.trim() && dropdownPos &&
                    typeof document !== 'undefined' &&
                    createPortal(
                      <div
                        data-tenant-dropdown
                        className="fixed max-h-48 overflow-y-auto card-elevated rounded-lg shadow-xl"
                        style={{
                          top: dropdownPos.top,
                          left: dropdownPos.left,
                          width: dropdownPos.width,
                          zIndex: 9999,
                        }}
                      >
                        {tenantOptions
                          .filter(
                            (t) =>
                              t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
                              t.slug.toLowerCase().includes(tenantSearch.toLowerCase()),
                          )
                          .map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-[color:var(--bg-hover)] transition-colors"
                              onClick={() => {
                                setComposeTenantId(t.id);
                                setSelectedTenantName(t.name);
                                setTenantSearch('');
                                setTenantPickerOpen(false);
                              }}
                            >
                              <div className="text-sm text-[color:var(--text-primary)] font-medium">
                                {t.name}
                              </div>
                              <div className="text-xs text-[color:var(--text-tertiary)]">
                                {t.slug} · {t.country} · {t.status}
                              </div>
                            </button>
                          ))}
                        {tenantsLoading && (
                          <div className="px-3 py-2 text-sm text-[color:var(--text-tertiary)]">
                            Loading SPs…
                          </div>
                        )}
                        {tenantsError && (
                          <div className="px-3 py-2 text-sm text-[color:var(--status-error-text)]">
                            Failed to load SPs: {tenantsError.message}
                          </div>
                        )}
                        {!tenantsLoading && !tenantsError &&
                          tenantOptions.filter(
                            (t) =>
                              t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
                              t.slug.toLowerCase().includes(tenantSearch.toLowerCase()),
                          ).length === 0 && (
                            <div className="px-3 py-2 text-sm text-[color:var(--text-tertiary)]">
                              No matching SPs found
                            </div>
                          )}
                      </div>,
                      document.body,
                    )}
                  {composeTenantId && selectedTenantName && (
                    <div className="mt-1.5 flex items-center gap-2 text-xs">
                      <Check className="w-3.5 h-3.5 text-[color:var(--accent-primary-deep)]" />
                      <span className="text-[color:var(--text-secondary)]">
                        Sending to{' '}
                        <span className="text-[color:var(--text-primary)] font-medium">
                          {selectedTenantName}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] ml-auto"
                        onClick={() => {
                          setComposeTenantId('');
                          setSelectedTenantName('');
                          setTenantSearch('');
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              )}

              <Field label="Priority">
                <select
                  className="input-field"
                  value={composePriority}
                  onChange={(e) => setComposePriority(e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </Field>

              <Field label="Subject">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Message subject"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                />
              </Field>

              <Field label="Body">
                <textarea
                  className="input-field min-h-[200px] resize-y"
                  placeholder="Write your message…"
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                />
              </Field>
            </div>
          </SlideOver>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)] ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3.5">{children}</td>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
        {label}
      </label>
      {children}
    </div>
  );
}

