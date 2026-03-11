'use client';

import {
  Mail, Phone, Linkedin, MessageSquare, PenLine,
  GitBranch, Trash2, Copy, RefreshCw, MoreHorizontal,
  LogOut, TrendingUp, Eye, MousePointerClick, Reply,
  Loader2, ChevronDown,
} from 'lucide-react';
import type { FlowStep, StepType, StepMetrics } from '@/lib/types';
import { useState, useRef, useEffect } from 'react';

export const STEP_TYPE_CONFIG: Record<string, {
  label: string;
  icon: typeof Mail;
  color: string;
  bgColor: string;
  borderColor: string;
  ringColor: string;
}> = {
  email: { label: 'Email', icon: Mail, color: 'text-blue-400', bgColor: 'bg-blue-600', borderColor: 'border-blue-500/40', ringColor: 'ring-blue-500/30' },
  phone: { label: 'Phone', icon: Phone, color: 'text-green-400', bgColor: 'bg-green-600', borderColor: 'border-green-500/40', ringColor: 'ring-green-500/30' },
  linkedin: { label: 'LinkedIn', icon: Linkedin, color: 'text-cyan-400', bgColor: 'bg-cyan-600', borderColor: 'border-cyan-500/40', ringColor: 'ring-cyan-500/30' },
  sms: { label: 'SMS', icon: MessageSquare, color: 'text-purple-400', bgColor: 'bg-purple-600', borderColor: 'border-purple-500/40', ringColor: 'ring-purple-500/30' },
  manual: { label: 'Task', icon: PenLine, color: 'text-gray-400', bgColor: 'bg-gray-600', borderColor: 'border-gray-500/40', ringColor: 'ring-gray-500/30' },
};

export const BRANCH_CONDITION_LABELS: Record<string, { label: string; color: string; icon: typeof Eye }> = {
  opened: { label: 'Opened', color: 'text-blue-400', icon: Eye },
  not_opened: { label: 'Not Opened', color: 'text-gray-400', icon: Eye },
  replied: { label: 'Replied', color: 'text-green-400', icon: Reply },
  replied_positive: { label: 'Replied +', color: 'text-green-400', icon: Reply },
  replied_negative: { label: 'Replied -', color: 'text-red-400', icon: Reply },
  bounced: { label: 'Bounced', color: 'text-red-400', icon: Reply },
  clicked: { label: 'Clicked', color: 'text-cyan-400', icon: MousePointerClick },
  no_engagement: { label: 'No Engagement', color: 'text-yellow-400', icon: Eye },
};

interface StepNodeProps {
  step: FlowStep;
  isSelected: boolean;
  isRoot: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddBranch: () => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
  nodeRef?: (el: HTMLDivElement | null) => void;
}

export default function StepNode({
  step,
  isSelected,
  isRoot,
  onSelect,
  onDelete,
  onDuplicate,
  onAddBranch,
  onRegenerate,
  isRegenerating,
  nodeRef,
}: StepNodeProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const config = STEP_TYPE_CONFIG[step.stepType] || STEP_TYPE_CONFIG.email;
  const Icon = config.icon;
  const metrics = step.metrics;
  const branchInfo = step.branchCondition ? BRANCH_CONDITION_LABELS[step.branchCondition] : null;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const getPreview = (): string => {
    if (step.stepType === 'email') return step.subjectTemplate || 'No subject';
    if (step.stepType === 'phone' || step.stepType === 'manual') return step.taskInstructions?.substring(0, 60) || 'No instructions';
    if (step.stepType === 'sms') return step.bodyTemplate?.substring(0, 60) || 'No message';
    return step.bodyTemplate?.substring(0, 60) || 'No content';
  };

  return (
    <div
      ref={nodeRef}
      data-step-id={step.id}
      onClick={onSelect}
      className={`
        relative w-[280px] bg-gray-900 rounded-xl border cursor-pointer
        transition-all duration-150 group
        ${isSelected
          ? `${config.borderColor} ring-2 ${config.ringColor} shadow-lg shadow-black/30`
          : 'border-gray-800 hover:border-gray-700 hover:shadow-md hover:shadow-black/20'
        }
      `}
    >
      {/* Branch condition badge */}
      {branchInfo && (
        <div className={`absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 ${branchInfo.color} whitespace-nowrap`}>
          <branchInfo.icon className="w-2.5 h-2.5" />
          {branchInfo.label}
        </div>
      )}

      {/* Step header */}
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        <div className={`w-8 h-8 rounded-lg ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-white">{config.label}</span>
            {isRoot && (
              <span className="text-[9px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded-full font-medium">START</span>
            )}
            {step.isExitStep && (
              <span className="text-[9px] bg-red-900/40 text-red-400 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                <LogOut className="w-2 h-2" /> EXIT
              </span>
            )}
            {step.variantLabel && (
              <span className="text-[9px] bg-yellow-900/30 text-yellow-400 px-1.5 py-0.5 rounded-full">{step.variantLabel}</span>
            )}
          </div>
          <p className="text-[11px] text-gray-500 truncate mt-0.5">{getPreview()}</p>
        </div>
        {step.delayDays > 0 && (
          <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded flex-shrink-0">
            +{step.delayDays}d
          </span>
        )}
      </div>

      {/* Metrics bar */}
      {metrics && metrics.total_executions > 0 && (
        <div className="flex items-center gap-3 px-3 pb-2 pt-1 border-t border-gray-800/60">
          <MetricPill icon={Eye} value={metrics.open_rate} label="open" color="text-blue-400" />
          <MetricPill icon={MousePointerClick} value={metrics.click_rate} label="click" color="text-cyan-400" />
          <MetricPill icon={Reply} value={metrics.reply_rate} label="reply" color="text-green-400" />
          <span className="text-[9px] text-gray-600 ml-auto">{metrics.sent_count} sent</span>
        </div>
      )}

      {/* Actions (visible on hover or select) */}
      <div className={`
        absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full
        flex flex-col gap-1 pl-2
        transition-opacity duration-100
        ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
      `}>
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="w-6 h-6 rounded-md bg-gray-800 border border-gray-700 hover:bg-gray-700 flex items-center justify-center transition-colors"
          >
            <MoreHorizontal className="w-3 h-3 text-gray-400" />
          </button>
          {showMenu && (
            <div className="absolute top-0 left-full ml-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1 min-w-[140px]">
              <MenuBtn icon={GitBranch} label="Add Branch" onClick={() => { onAddBranch(); setShowMenu(false); }} />
              <MenuBtn icon={Copy} label="Duplicate" onClick={() => { onDuplicate(); setShowMenu(false); }} />
              <MenuBtn icon={isRegenerating ? Loader2 : RefreshCw} label={isRegenerating ? 'Regenerating...' : 'Regenerate'} onClick={() => { onRegenerate(); setShowMenu(false); }} />
              <div className="border-t border-gray-700 my-1" />
              <MenuBtn icon={Trash2} label="Delete" onClick={() => { onDelete(); setShowMenu(false); }} danger />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricPill({ icon: Icon, value, label, color }: { icon: typeof Eye; value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-0.5">
      <Icon className={`w-2.5 h-2.5 ${color}`} />
      <span className={`text-[10px] font-medium ${color}`}>{value}%</span>
      <span className="text-[9px] text-gray-600">{label}</span>
    </div>
  );
}

function MenuBtn({ icon: Icon, label, onClick, danger }: { icon: typeof Trash2; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
        danger ? 'text-red-400 hover:bg-red-900/20' : 'text-gray-300 hover:bg-gray-700'
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}
