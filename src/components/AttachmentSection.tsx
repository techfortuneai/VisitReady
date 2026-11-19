/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { Attachment } from '../types/index.ts';
import { Upload, FileText, Trash2, Eye } from 'lucide-react';
import { formatCategoryLabel, formatFileSize } from './AttachmentViewerModal.tsx';

interface AttachmentSectionProps {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  title?: string;
  onError?: (msg: string) => void;
  onLoadingChange?: (isReading: boolean) => void;
  onPreview?: (att: Attachment) => void;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Unable to read "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

export const AttachmentSection: React.FC<AttachmentSectionProps> = ({
  attachments,
  onChange,
  title = 'Upload Reports, Prescriptions & Documents (Optional)',
  onError,
  onLoadingChange,
  onPreview,
}) => {
  const [category, setCategory] = useState<Attachment['category']>('lab_report');
  const [isReading, setIsReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const oversized = files.find((f) => f.size > MAX_FILE_BYTES);
    if (oversized) {
      onError?.(`"${oversized.name}" exceeds 10 MB limit. Please upload a smaller file.`);
      return;
    }

    setIsReading(true);
    onLoadingChange?.(true);
    onError?.('');

    try {
      const readResults = await Promise.all(
        files.map(async (file) => {
          const dataUrl = await readFileAsDataUrl(file);
          const safeId =
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          return {
            id: safeId,
            file_name: file.name,
            file_size: file.size,
            file_type: file.type || 'application/octet-stream',
            category,
            uploaded_at: new Date().toISOString(),
            data_url: dataUrl,
          } as Attachment;
        })
      );
      onChange([...attachments, ...readResults]);
    } catch (err: any) {
      onError?.(err?.message || 'Could not read selected file.');
    } finally {
      setIsReading(false);
      onLoadingChange?.(false);
    }
  };

  return (
    <div className="border border-emerald-200/80 rounded-xl p-3.5 bg-zinc-50/70 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-zinc-700">{title}</span>
        <div className="flex items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Attachment['category'])}
            className="px-2 py-1 border border-zinc-200 rounded-lg text-xs bg-white"
          >
            <option value="lab_report">Lab Report</option>
            <option value="prescription">Prescription</option>
            <option value="clinical_summary">OPD / Discharge Note</option>
            <option value="photo">Document / Photo</option>
            <option value="other">Other</option>
          </select>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            disabled={isReading}
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-50 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {isReading ? 'Reading...' : 'Upload Files'}
          </button>
        </div>
      </div>

      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map((att) => {
            const isImage =
              att.file_type?.startsWith('image/') || att.data_url?.startsWith('data:image/');
            return (
              <div
                key={att.id}
                className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isImage ? (
                    <img
                      src={att.data_url}
                      alt={att.file_name}
                      className="w-8 h-8 rounded object-cover border border-zinc-200 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-emerald-700" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-800">{att.file_name}</div>
                    <div className="text-3xs text-zinc-400">
                      {formatCategoryLabel(att.category)}
                      {att.file_size ? ` · ${formatFileSize(att.file_size)}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {onPreview && (
                    <button
                      type="button"
                      onClick={() => onPreview(att)}
                      className="p-1 text-zinc-500 hover:text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
                      title="Preview file"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onChange(attachments.filter((item) => item.id !== att.id))}
                    className="text-zinc-400 hover:text-rose-600 p-1 cursor-pointer"
                    title="Remove file"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface AttachmentBadgeStripProps {
  attachments?: Attachment[];
  onOpenAttachment: (att: Attachment) => void;
  label?: string;
}

export const AttachmentBadgeStrip: React.FC<AttachmentBadgeStripProps> = ({
  attachments,
  onOpenAttachment,
  label,
}) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="pt-1.5 space-y-1.5">
      {label && (
        <div className="text-3xs font-semibold uppercase tracking-wider text-emerald-800">
          {label} ({attachments.length})
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {attachments.map((att) => {
          const isImage =
            att.file_type?.startsWith('image/') || att.data_url?.startsWith('data:image/');
          return (
            <button
              key={att.id}
              type="button"
              onClick={() => onOpenAttachment(att)}
              className="group flex items-center gap-2 px-2 py-1.5 rounded-lg bg-emerald-50/50 hover:bg-emerald-100/70 border border-emerald-200/80 text-left transition-colors cursor-pointer max-w-[240px]"
              title={`View ${att.file_name}`}
            >
              {isImage ? (
                <img
                  src={att.data_url}
                  alt={att.file_name}
                  className="w-7 h-7 rounded object-cover border border-emerald-200 shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded bg-white border border-emerald-200 flex items-center justify-center shrink-0">
                  <FileText className="w-3.5 h-3.5 text-emerald-700" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-2xs font-medium text-zinc-800 group-hover:text-emerald-950 truncate">
                  {att.file_name}
                </div>
                <div className="text-3xs text-emerald-700">
                  {formatCategoryLabel(att.category)} · View
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
