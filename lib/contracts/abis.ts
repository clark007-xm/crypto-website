/**
 * Contract ABIs for One tap (Commit-Reveal lottery system)
 * Using ethers v6 human-readable ABI format.
 */

export const CONTRACT_ERROR_ABI = [
  "error AlreadyPartner()",
  "error AlreadySettled()",
  "error ArrayLengthMismatch()",
  "error FeeTooHigh(uint16 totalFee)",
  "error IncorrectETHAmount(uint256 expected, uint256 actual)",
  "error InsufficientBalance(uint256 available, uint256 requested)",
  "error InsufficientDeposit(uint256 available, uint256 required)",
  "error InvalidAddress()",
  "error InvalidAmount()",
  "error InvalidBPS(uint16 bps)",
  "error InvalidReveal(bytes32 expected, bytes32 actual)",
  "error InvalidZeroInput()",
  "error MissingCommitment()",
  "error NoTicketsOwned(address player)",
  "error NotAnAuthorizedPartner(address partner)",
  "error NotPartner()",
  "error PartnerMismatch(address expected, address actual)",
  "error SessionAlreadyRegistered(address session)",
  "error SessionStatusError(bool isSettled, uint256 sold)",
  "error SoldOut(uint256 available, uint256 requested)",
  "error TimeConstraintError(uint256 current, uint256 required)",
  "error Unauthorized(address caller, string role)",
  "error WithdrawFailed()",
  "error ZeroAddress()",
] as const

/* ── ERC-20 (USDT) ── */
export const ERC20_ABI = [
  // Read
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  // Write
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
] as const

/* ── CommitRevealFactory ── */
export const FACTORY_ABI_LEGACY = [
  // Legacy SessionConfig:
  // (admin, creator, sessionCommitment, treasury, paymentToken, ticketPrice, totalTickets,
  //  partnerShareBps, platformFeeBps, unsoldTicketsPartnerDepositSlashBps,
  //  creatorAbsentPartnerDepositSlashBps, commitDurationSeconds, revealDurationSeconds, unlockTimestamp)

  // Read
  "function admin() view returns (address)",
  "function treasury() view returns (address)",
  "function isPartner(address account) view returns (bool)",
  "function platformFeeBps() view returns (uint16)",
  "function creatorAbsentPartnerDepositSlashBps() view returns (uint16)",

  // Write
  "function createSession(tuple(address admin, address creator, bytes32 sessionCommitment, address treasury, address paymentToken, uint256 ticketPrice, uint256 totalTickets, uint16 partnerShareBps, uint16 platformFeeBps, uint16 unsoldTicketsPartnerDepositSlashBps, uint16 creatorAbsentPartnerDepositSlashBps, uint256 commitDurationSeconds, uint256 revealDurationSeconds, uint256 unlockTimestamp) config) external returns (address session)",
  "function setPartner(address partner, bool enabled) external",
  "function setPlatformFeeBps(uint16 bps) external",
  "function setCreatorAbsentPartnerDepositSlashBps(uint16 bps) external",
  "function emergencyUnlockPartnerDeposit(address session, address partner) external",

  // Events
  "event SessionCreated(address indexed creator, address indexed session, tuple(address admin, address creator, bytes32 sessionCommitment, address treasury, address paymentToken, uint256 ticketPrice, uint256 totalTickets, uint16 partnerShareBps, uint16 platformFeeBps, uint16 unsoldTicketsPartnerDepositSlashBps, uint16 creatorAbsentPartnerDepositSlashBps, uint256 commitDurationSeconds, uint256 revealDurationSeconds, uint256 unlockTimestamp) config)",
  "event PartnerAdded(address partner)",
  "event PartnerRemoved(address partner)",
] as const

export const FACTORY_ABI = [
  // Structs (inline in function signatures)
  // SessionConfig: (admin, creator, productInfoId, sessionCommitment, treasury, paymentToken, ticketPrice, totalTickets, partnerShareBps, platformFeeBps, unsoldTicketsPartnerDepositSlashBps, creatorAbsentPartnerDepositSlashBps, commitDurationSeconds, revealDurationSeconds, unlockTimestamp)

  // Read
  "function admin() view returns (address)",
  "function treasury() view returns (address)",
  "function isPartner(address account) view returns (bool)",
  "function platformFeeBps() view returns (uint16)",
  "function creatorAbsentPartnerDepositSlashBps() view returns (uint16)",
  
  // Write
  "function createSession(tuple(address admin, address creator, uint256 productInfoId, bytes32 sessionCommitment, address treasury, address paymentToken, uint256 ticketPrice, uint256 totalTickets, uint16 partnerShareBps, uint16 platformFeeBps, uint16 unsoldTicketsPartnerDepositSlashBps, uint16 creatorAbsentPartnerDepositSlashBps, uint256 commitDurationSeconds, uint256 revealDurationSeconds, uint256 unlockTimestamp) config) external returns (address session)",
  "function setPartner(address partner, bool enabled) external",
  "function setPlatformFeeBps(uint16 bps) external",
  "function setCreatorAbsentPartnerDepositSlashBps(uint16 bps) external",
  "function emergencyUnlockPartnerDeposit(address session, address partner) external",

  // Events
  "event SessionCreated(address indexed creator, address indexed session, tuple(address admin, address creator, uint256 productInfoId, bytes32 sessionCommitment, address treasury, address paymentToken, uint256 ticketPrice, uint256 totalTickets, uint16 partnerShareBps, uint16 platformFeeBps, uint16 unsoldTicketsPartnerDepositSlashBps, uint16 creatorAbsentPartnerDepositSlashBps, uint256 commitDurationSeconds, uint256 revealDurationSeconds, uint256 unlockTimestamp) config)",
  "event PartnerAdded(address partner)",
  "event PartnerRemoved(address partner)",
] as const

/* ── CommitRevealSession ── */
export const SESSION_ABI = [
  // Read - State variables (from ABI)
  "function admin() view returns (address)",
  "function creator() view returns (address)",
  "function productInfoId() view returns (uint256)",
  "function commitDurationSeconds() view returns (uint256)",
  "function creatorAbsentPartnerDepositSlashBps() view returns (uint16)",
  "function isSettled() view returns (bool)",
  "function nextTicketIndex() view returns (uint256)",
  "function partnerShareBps() view returns (uint16)",
  "function paymentToken() view returns (address)",
  "function platformFeeBps() view returns (uint16)",
  "function playerCommitment() view returns (bytes32)",
  "function revealDurationSeconds() view returns (uint256)",
  "function sessionCommitment() view returns (bytes32)",
  "function settledType() view returns (uint8)",
  "function ticketCounts(address player) view returns (uint256)",
  "function ticketPrice() view returns (uint256)",
  "function ticketToPlayer(uint256 ticketId) view returns (address)",
  "function totalTickets() view returns (uint256)",
  "function treasury() view returns (address)",
  "function unlockTimestamp() view returns (uint256)",
  "function unsoldTicketsPartnerDepositSlashBps() view returns (uint16)",

  // Write
  "function playerBuyAndCommitTicket(uint256 quantity, bytes32 secret, bool useBalance) external payable",
  "function reveal(bytes revealData, bytes32 salt) external",
  "function finalizeTicketsUnsoldSettlement() external",
  "function creditPrincipalAndPenaltyIfTicketsUnsold() external",
  "function finalizeCreatorAbsentSettlement() external",
  "function creditPrincipalAndCompensationIfCreatorAbsent() external",

  // Events
  "event CreatorAbsenceFinalized(address indexed admin, uint256 totalSlashed)",
  "event TicketsPurchased(address indexed player, uint256 quantity, uint256 nextIndex)",
  "event SessionSettled(uint8 indexed settlementType)",
  "event WinnerSelected(address indexed winner, uint256 ticketIndex)",
  "event RefundClaimed(address indexed player, uint256 amount)",
] as const

/* ── CommitRevealTreasury ── */
export const TREASURY_ABI = [
  // Read
  "function factory() view returns (address)",
  "function balances(address user) view returns (uint256)",
  "function sessionConfig(address session) view returns (address partner, bool isSession)",
  "function sessionBalances(address session) view returns (uint256 playerTicketAmount, uint256 partnerDepositAmount)",
  
  // Write - Partner deposit uses ETH (payable)
  "function partnerDeposit() external payable",
  "function withdraw(uint256 amount) external",
  "function registerSession(address session, address partner) external",
  "function playerPayTicket(address player) external payable",
  "function playerPayTicketUseBalance(address player, uint256 amount) external",
  "function lockPartnerDeposit(address session, address partner, uint256 amount) external",
  "function unlockPartnerDeposit(uint256 amount) external",
  "function slashPartnerDeposit(uint256 amount, address recipient) external",
  "function emergencyUnlockPartnerDeposit(address session, address partner) external",
  "function distributeFunds(address user, uint256 amount) external",
  "function distributeFundsBatch(address[] calldata users, uint256[] calldata amounts) external",
  
  // Events
  "event PartnerDepositUpdated(address indexed partner, uint256 amount)",
  "event Withdraw(address indexed user, uint256 amount)",
  "event PartnerDepositLocked(address indexed session, address indexed partner, uint256 amount)",
  "event PartnerDepositUnlocked(address indexed session, address indexed partner, uint256 amount)",
  "event PartnerDepositSlashed(address indexed session, address indexed partner, uint256 amount, address recipient)",
  "event DistributeFunds(address indexed session, address indexed user, uint256 amount)",
] as const

/* ── CommitRevealTreasuryIFactory (interface check) ── */
export const TREASURY_IFACTORY_ABI = [
  "function isPartner(address account) view returns (bool)",
] as const
