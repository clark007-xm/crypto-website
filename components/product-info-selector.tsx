"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { useIsMobile } from "@/components/ui/use-mobile"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import type { ProductInfoOption } from "@/lib/product-info"

interface ProductInfoSelectorProps {
  value: number | null
  options: ProductInfoOption[]
  label: string
  hint: string
  placeholder: string
  dialogTitle: string
  dialogDescription: string
  onChange: (value: number) => void
}

export function ProductInfoSelector({
  value,
  options,
  label,
  hint,
  placeholder,
  dialogTitle,
  dialogDescription,
  onChange,
}: ProductInfoSelectorProps) {
  const isMobile = useIsMobile()
  const [dialogOpen, setDialogOpen] = useState(false)

  const selectedOption = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value]
  )

  return (
    <div className="form-control">
      <label className="label">
        <span className="label-text font-semibold">{label}</span>
      </label>

      {isMobile ? (
        <>
          <button
            type="button"
            className="flex h-14 w-full items-center justify-between rounded-2xl border border-base-content/10 bg-base-100 px-4 text-left shadow-[0_12px_32px_-24px_rgba(15,23,42,0.7)] transition-all hover:border-primary/30 hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.8)]"
            onClick={() => setDialogOpen(true)}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-semibold ${
                  selectedOption
                    ? "border-primary/20 bg-primary/10 text-primary"
                    : "border-base-content/10 bg-base-200 text-base-content/35"
                }`}
              >
                {selectedOption?.shortLabel ?? "OT"}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.24em] text-base-content/35">{label}</p>
                <p className={selectedOption ? "truncate font-semibold text-base-content" : "truncate font-semibold text-base-content/40"}>
                  {selectedOption?.label ?? placeholder}
                </p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-base-content/50" />
          </button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
              <DialogHeader className="px-5 pt-5">
                <DialogTitle>{dialogTitle}</DialogTitle>
                <DialogDescription>{dialogDescription}</DialogDescription>
              </DialogHeader>

              <div className="px-4 pb-4 pt-2">
                <div className="space-y-2">
                  {options.map((option) => {
                    const isActive = option.id === value
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition-colors ${
                          isActive
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-base-content/10 bg-base-100 hover:border-primary/30"
                        }`}
                        onClick={() => {
                          onChange(option.id)
                          setDialogOpen(false)
                        }}
                      >
                        <div>
                          <p className="font-semibold">{option.label}</p>
                        </div>
                        {isActive && <Check className="h-5 w-5" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <Select
          value={value ? String(value) : undefined}
          onValueChange={(nextValue) => onChange(Number(nextValue))}
        >
          <SelectTrigger className="h-16 rounded-2xl border-base-content/10 bg-base-100 px-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.7)] transition-all hover:border-primary/30 hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.8)] focus:ring-primary/20 focus:ring-offset-0">
            <div className="flex min-w-0 flex-1 items-center gap-3 pr-2 text-left">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-sm font-semibold ${
                  selectedOption
                    ? "border-primary/20 bg-primary/10 text-primary"
                    : "border-base-content/10 bg-base-200 text-base-content/35"
                }`}
              >
                {selectedOption?.shortLabel ?? "OT"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-[0.24em] text-base-content/35">{label}</p>
                <p className={selectedOption ? "truncate text-sm font-semibold text-base-content" : "truncate text-sm font-semibold text-base-content/40"}>
                  {selectedOption?.label ?? placeholder}
                </p>
              </div>
            </div>
          </SelectTrigger>
          <SelectContent className="rounded-2xl border border-base-content/10 bg-base-100 p-2 shadow-2xl">
            {options.map((option) => (
              <SelectItem
                key={option.id}
                value={String(option.id)}
                className="min-h-14 rounded-xl py-3 pl-10 pr-4 text-sm font-semibold focus:bg-primary/10 focus:text-primary"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {hint.trim() ? (
        <label className="label">
          <span className="label-text-alt text-base-content/40">{hint}</span>
        </label>
      ) : null}
    </div>
  )
}
