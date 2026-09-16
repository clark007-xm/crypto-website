import { Suspense } from "react"
import { OneTapHome } from "@/components/one-tap/home"

export default function Page() {
  return <Suspense fallback={<div className="ot-loading"><span className="loading loading-spinner text-primary" /></div>}><OneTapHome /></Suspense>
}
