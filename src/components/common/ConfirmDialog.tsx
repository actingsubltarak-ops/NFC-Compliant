import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Info } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  showCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  type = 'info',
  showCancel = true,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />

          {/* Modal content */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white p-6 shadow-2xl border border-slate-100"
          >
            <div className="flex flex-col items-center text-center">
              {/* Icon */}
              <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${
                type === 'danger' 
                  ? 'bg-red-50 text-red-600' 
                  : type === 'warning'
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-blue-50 text-blue-600'
              }`}>
                {type === 'danger' || type === 'warning' ? (
                  <AlertTriangle size={24} />
                ) : (
                  <Info size={24} />
                )}
              </div>

              {/* Text */}
              <h3 className="text-base font-black text-slate-900">{title}</h3>
              <p className="mt-2 text-xs font-semibold text-slate-500 leading-relaxed whitespace-pre-line">
                {message}
              </p>

              {/* Actions */}
              <div className="mt-6 flex w-full gap-3">
                {showCancel && (
                  <button
                    onClick={onCancel}
                    className="flex-1 rounded-xl border border-slate-200 py-3 text-xs font-black text-slate-700 hover:bg-slate-50 active:scale-95 transition-all outline-none"
                  >
                    {cancelText}
                  </button>
                )}
                <button
                  onClick={() => {
                    onConfirm();
                    onCancel();
                  }}
                  className={`flex-1 rounded-xl py-3 text-xs font-black text-white active:scale-95 transition-all outline-none shadow-md ${
                    type === 'danger'
                      ? 'bg-red-600 hover:bg-red-700 shadow-red-100'
                      : type === 'warning'
                        ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-100'
                        : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'
                  }`}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
