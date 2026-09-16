"use client"
import { useEffect, useRef, useState } from "react"
import { CheckCircle2, Minus, Plus, X } from "lucide-react"
import { useOneTapCopy } from "./navigation"

/** Isolated visual preview. Never imports wallet or contract transaction hooks. */
export function PreviewDialog({ open, maxEntries, onClose }: { open: boolean; maxEntries: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const copy = useOneTapCopy()
  const [quantity, setQuantity] = useState(1)
  const [complete, setComplete] = useState(false)
  useEffect(() => {
    if (open) { setQuantity(1); setComplete(false); dialog.current?.showModal() }
    else dialog.current?.close()
  }, [open])
  return <dialog ref={dialog} onClose={onClose} className="modal modal-bottom sm:modal-middle ot-preview-dialog">
    <div className="modal-box">
      <div className="ot-dialog-heading"><h2>{copy.previewTitle}</h2><button className="ot-icon-button" aria-label={copy.back} onClick={onClose}><X /></button></div>
      {complete ? <div className="ot-preview-success"><CheckCircle2 size={44} /><h3>{copy.previewSuccess}</h3><p>{copy.previewSuccessText}</p><button className="ot-primary" onClick={onClose}>{copy.done}</button></div> : <>
        <p className="ot-preview-notice">{copy.previewNote}</p>
        <div className="ot-setting-row"><label htmlFor="preview-quantity">{copy.quantity}</label><div className="ot-stepper"><button aria-label={copy.quantity + " -1"} onClick={() => setQuantity(v => Math.max(1, v - 1))} disabled={quantity <= 1}><Minus size={18} /></button><input id="preview-quantity" type="number" min={1} max={maxEntries} value={quantity} onChange={e => setQuantity(Math.max(1, Math.min(maxEntries, Number.parseInt(e.target.value, 10) || 1)))} /><button aria-label={copy.quantity + " +1"} onClick={() => setQuantity(v => Math.min(maxEntries, v + 1))} disabled={quantity >= maxEntries}><Plus size={18} /></button></div></div>
        <div className="ot-preview-total"><span>{copy.total}</span><strong>{quantity} <small>USDT</small></strong></div>
        <button className="ot-primary" onClick={() => setComplete(true)}>{copy.previewConfirm}</button>
      </>}
    </div>
    <form method="dialog" className="modal-backdrop"><button aria-label={copy.back}>Close</button></form>
  </dialog>
}
