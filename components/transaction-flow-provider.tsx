"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, SendHorizonal, Wallet, X } from "lucide-react"
import type { ContractTransactionResponse } from "ethers"
import { useT } from "@/lib/i18n/context"
import { getExplorerTxUrl } from "@/lib/contracts/addresses"
import type { TransactionLifecycleCallbacks } from "@/lib/transactions/types"

type TransactionStage = "awaiting" | "submitted" | "success" | "error"
type TransactionFieldTone = "default" | "success" | "warning"

export interface TransactionFlowField {
  label: string
  value: string
  tone?: TransactionFieldTone
}

export interface TransactionFlowConfig {
  chainId: number | null
  fields: TransactionFlowField[]
}

interface TransactionOverlayState extends TransactionFlowConfig {
  id: number
  stage: TransactionStage
  txHash: string | null
  errorMessage: string | null
  visible: boolean
}

interface TransactionFlowController {
  callbacks: TransactionLifecycleCallbacks
}

interface TransactionFlowContextValue {
  createController: (config: TransactionFlowConfig) => TransactionFlowController
  close: () => void
}

const TransactionFlowContext = createContext<TransactionFlowContextValue | null>(null)

function formatTransactionError(error: unknown) {
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  return null
}

export function TransactionFlowProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const [state, setState] = useState<TransactionOverlayState | null>(null)
  const counterRef = useRef(0)

  const updateState = useCallback((id: number, updater: (current: TransactionOverlayState) => TransactionOverlayState) => {
    setState((current) => {
      if (!current || current.id !== id) return current
      return updater(current)
    })
  }, [])

  const createController = useCallback(
    (config: TransactionFlowConfig): TransactionFlowController => {
      counterRef.current += 1
      const id = counterRef.current

      setState({
        ...config,
        id,
        stage: "awaiting",
        txHash: null,
        errorMessage: null,
        visible: true,
      })

      const setStage = (
        stage: TransactionStage,
        tx: ContractTransactionResponse | null = null,
        errorMessage: string | null = null
      ) => {
        updateState(id, (current) => ({
          ...current,
          stage,
          txHash: tx?.hash ?? current.txHash,
          errorMessage,
        }))
      }

      return {
        callbacks: {
          onAwaitingSignature: () => {
            setStage("awaiting")
          },
          onSubmitted: (tx) => {
            setStage("submitted", tx)
          },
          onConfirmed: (tx) => {
            setStage("success", tx)
          },
          onError: (error) => {
            setStage("error", null, formatTransactionError(error))
          },
        },
      }
    },
    [updateState]
  )

  const close = useCallback(() => {
    setState((current) => (current ? { ...current, visible: false } : null))
  }, [])

  const value = useMemo(
    () => ({
      createController,
      close,
    }),
    [createController, close]
  )

  const progressWidth =
    state?.stage === "awaiting"
      ? "33%"
      : state?.stage === "submitted"
        ? "66%"
        : state?.stage === "success" || state?.stage === "error"
          ? "100%"
          : "0%"

  const progressTone =
    state?.stage === "success"
      ? "bg-success"
      : state?.stage === "error"
        ? "bg-error"
        : "bg-primary"

  const title =
    state?.stage === "awaiting"
      ? t.tx.confirmTitle
      : state?.stage === "submitted"
        ? t.tx.sentTitle
        : state?.stage === "success"
          ? t.tx.successTitle
          : t.tx.errorTitle

  const description =
    state?.stage === "awaiting"
      ? t.tx.confirmSubtitle
      : state?.stage === "submitted"
        ? t.tx.sentSubtitle
        : state?.stage === "success"
          ? t.tx.successSubtitle
          : state?.errorMessage ?? t.tx.errorSubtitle

  const Icon =
    state?.stage === "awaiting"
      ? Wallet
      : state?.stage === "submitted"
        ? SendHorizonal
        : state?.stage === "success"
          ? CheckCircle2
          : AlertTriangle

  const iconTone =
    state?.stage === "success"
      ? "text-success bg-success/10"
      : state?.stage === "error"
        ? "text-error bg-error/10"
        : "text-primary bg-primary/10"

  return (
    <TransactionFlowContext.Provider value={value}>
      {children}
      {state?.visible && (
        <>
          <div className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-sm" onClick={close} />
          <div className="fixed inset-x-0 bottom-0 z-[81] md:inset-0 md:flex md:items-center md:justify-center pointer-events-none">
            <div
              className="w-full rounded-t-3xl bg-base-100 shadow-2xl md:w-[560px] md:rounded-3xl pointer-events-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-end p-4 pb-0">
                <button className="btn btn-ghost btn-sm btn-circle text-base-content/50" onClick={close}>
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="px-5 pb-6 pt-2 sm:px-8 sm:pb-8">
                <div className="text-center">
                  <h3 className="text-2xl font-bold sm:text-4xl">{title}</h3>
                  <div className={`mx-auto mt-6 flex h-20 w-20 items-center justify-center rounded-3xl ${iconTone}`}>
                    <Icon className="h-10 w-10" />
                  </div>
                  <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-base-content/70 sm:text-base">
                    {description}
                  </p>
                </div>

                <div className="mt-6 rounded-full bg-base-200 p-1">
                  <div
                    className={`h-12 rounded-full ${progressTone} transition-all duration-300`}
                    style={{ width: progressWidth }}
                  >
                    <div className="flex h-full items-center justify-between px-5 text-sm font-semibold text-primary-content">
                      <span>
                        {state.stage === "awaiting"
                          ? t.tx.progressConfirm
                          : state.stage === "submitted"
                            ? t.tx.progressSent
                            : state.stage === "success"
                              ? t.tx.progressSuccess
                              : t.tx.progressError}
                      </span>
                      {state.stage === "awaiting" && <Loader2 className="h-5 w-5 animate-spin" />}
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {state.fields.map((field) => (
                    <div
                      key={`${field.label}-${field.value}`}
                      className="flex items-center justify-between rounded-2xl border border-base-300 bg-base-100 px-5 py-4"
                    >
                      <span className="text-sm font-medium text-base-content/60">{field.label}</span>
                      <div className="flex items-center gap-3 text-right">
                        <span className="text-sm font-semibold sm:text-base">{field.value}</span>
                        {field.tone === "success" && <span className="h-4 w-4 rounded-full bg-success shadow-[0_0_18px_rgba(34,197,94,0.5)]" />}
                        {field.tone === "warning" && <span className="h-4 w-4 rounded-full bg-warning shadow-[0_0_18px_rgba(250,204,21,0.5)]" />}
                      </div>
                    </div>
                  ))}
                </div>

                {state.txHash && (
                  <a
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 text-sm font-semibold text-primary hover:opacity-80"
                    href={getExplorerTxUrl(state.chainId, state.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t.tx.viewOnExplorer}
                  </a>
                )}

                {state.stage === "error" && state.errorMessage && (
                  <div className="alert alert-error mt-5 py-3">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="text-sm">{state.errorMessage}</span>
                  </div>
                )}

                <button
                  className={`btn mt-6 w-full ${state.stage === "awaiting" ? "btn-disabled" : "btn-primary"}`}
                  disabled={state.stage === "awaiting"}
                  onClick={close}
                >
                  {state.stage === "awaiting" ? t.tx.waitingWallet : t.tx.close}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </TransactionFlowContext.Provider>
  )
}

export function useTransactionFlow() {
  const context = useContext(TransactionFlowContext)
  if (!context) {
    throw new Error("useTransactionFlow must be used within <TransactionFlowProvider>")
  }
  return context
}
