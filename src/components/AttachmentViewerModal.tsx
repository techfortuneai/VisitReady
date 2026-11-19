/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Attachment } from '../types/index.ts';
import { X, Download, FileText } from 'lucide-react';

interface AttachmentViewerModalProps {
  attachment: Attachment | null;
  onClose: () => void;
}

export function formatCategoryLabel(category: Attachment['category']): string {
  switch (category) {
    case 'lab_report':
      return 'Lab Report';
    case 'prescription':
      return 'Prescription';
    case 'clinical_summary':
      return 'OPD / Discharge Note';
    case 'photo':
      return 'Document / Photo';
    default:
      return 'Document';
  }
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AttachmentViewerModal: React.FC<AttachmentViewerModalProps> = ({
  attachment,
  onClose,
}) => {
  if (!attachment) return null;

  const isImage =
    attachment.file_type?.startsWith('image/') ||
    attachment.data_url?.startsWith('data:image/');
  const isPdf =
    attachment.file_type === 'application/pdf' ||
    attachment.file_name.toLowerCase().endsWith('.pdf') ||
    attachment.data_url?.startsWith('data:application/pdf');

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-zinc-900/70 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-emerald-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-emerald-100 bg-emerald-50/40 shrink-0 gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-zinc-900 truncate">
                {attachment.file_name}
              </h3>
              <span className="text-2xs px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold shrink-0">
                {formatCategoryLabel(attachment.category)}
              </span>
            </div>
            <p className="text-2xs text-zinc-500 mt-0.5">
              {[
                formatFileSize(attachment.file_size),
                attachment.uploaded_at
                  ? `Uploaded ${new Date(attachment.uploaded_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}`
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={attachment.data_url}
              download={attachment.file_name}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-emerald-100/50 cursor-pointer"
              title="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 bg-zinc-50 flex-1 overflow-auto flex items-center justify-center min-h-[280px]">
          {isImage ? (
            <img
              src={attachment.data_url}
              alt={attachment.file_name}
              className="max-w-full max-h-[72vh] object-contain rounded-lg border border-zinc-200 bg-white shadow-xs"
            />
          ) : isPdf ? (
            <iframe
              src={attachment.data_url}
              title={attachment.file_name}
              className="w-full h-[70vh] rounded-lg border border-zinc-200 bg-white"
            />
          ) : (
            <div className="text-center py-10 px-6 space-y-3 bg-white rounded-xl border border-zinc-200 max-w-sm">
              <FileText className="w-10 h-10 text-emerald-700 mx-auto" />
              <p className="text-sm font-semibold text-zinc-900 break-all">
                {attachment.file_name}
              </p>
              <p className="text-xs text-zinc-500">
                Preview is not available for this file format. Download it to view on your device.
              </p>
              <a
                href={attachment.data_url}
                download={attachment.file_name}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold"
              >
                <Download className="w-4 h-4" />
                Download File
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
