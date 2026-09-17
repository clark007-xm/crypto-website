/** Public creation receipt verified on Sepolia; never infer other deployments from this entry. */
export const VERIFIED_DEPLOYMENTS = [
  {
  "chainId": 11155111,
  "factory": "0xae522eD9016Bb7CaFCa7294aAd2Fa7EBd0A78934",
  "deploymentBlock": 10662082,
  "previousEmpty": true,
  "codePresent": true,
  "transactionHash": "0x8b9c3c039c539bd7d7c391a093af1b6b81ef326304342bad6c939943c7c73aec",
  "blockHash": "0x78474e6820c556ddae285c98359bbad5c2d2c6a4c2f50a469ff3b4ee040ec99d"
},
] as const

export function verifiedDeploymentBlock(chainId: number, factory: string): number | undefined {
  return VERIFIED_DEPLOYMENTS.find(entry => entry.chainId === chainId && entry.factory.toLowerCase() === factory.toLowerCase())?.deploymentBlock
}

export function resolveDeploymentBlock(chainId: number, factory: string, configured: number): number {
  const verified = verifiedDeploymentBlock(chainId, factory)
  // Keep an explicitly later scan boundary; unknown deployments retain their configuration.
  return verified === undefined ? configured : Math.max(configured, verified)
}
