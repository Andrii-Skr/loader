"use client";

import { FileUp } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

type FileDropzoneProps = Omit<
  React.ComponentProps<"input">,
  "type" | "onDragEnter" | "onDragLeave" | "onDragOver" | "onDrop"
> & {
  active?: boolean;
  hint: string;
  title: string;
  description: string;
  onFileSelect?: (files: File[]) => void;
  onDragEnter?: React.DragEventHandler<HTMLLabelElement>;
  onDragLeave?: React.DragEventHandler<HTMLLabelElement>;
  onDragOver?: React.DragEventHandler<HTMLLabelElement>;
  onDrop?: React.DragEventHandler<HTMLLabelElement>;
};

const FileDropzone = React.forwardRef<HTMLInputElement, FileDropzoneProps>(
  (
    {
      active = false,
      className,
      description,
      hint,
      id,
      onChange,
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
      onFileSelect,
      title,
      ...props
    },
    ref,
  ) => {
    return (
      <div className={cn("grid gap-2", className)}>
        <input
          ref={ref}
          id={id}
          className="sr-only"
          type="file"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            onFileSelect?.(files);
            onChange?.(event);
          }}
          {...props}
        />
        <label
          className={cn(
            "grid cursor-pointer grid-cols-[auto_1fr] items-center gap-4 rounded-[24px] border-[1.5px] border-dashed border-[color:var(--line)] bg-[color:var(--panel-strong)] p-[22px] transition-[transform,border-color,background,box-shadow] duration-150 hover:-translate-y-px hover:border-[rgba(177,74,47,0.45)] hover:bg-[color:var(--panel)] hover:shadow-[0_18px_44px_rgba(32,22,12,0.1)]",
            active &&
              "-translate-y-px border-[rgba(177,74,47,0.45)] bg-[color:var(--panel)] shadow-[0_18px_44px_rgba(32,22,12,0.1)]",
          )}
          htmlFor={id}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={(event) => {
            const files = Array.from(event.dataTransfer.files ?? []);
            onFileSelect?.(files);
            onDrop?.(event);
          }}
        >
          <span className="grid size-[52px] place-items-center rounded-[18px] bg-[rgba(177,74,47,0.14)] text-[color:var(--accent-strong)]">
            <FileUp size={24} />
          </span>
          <span className="grid gap-1">
            <strong className="text-[color:var(--ink)]">{title}</strong>
            <span className="text-sm text-[color:var(--ink-soft)]">{description}</span>
            <span className="text-[0.92rem] text-[color:var(--accent-strong)]">{hint}</span>
          </span>
        </label>
      </div>
    );
  },
);

FileDropzone.displayName = "FileDropzone";

export { FileDropzone };
