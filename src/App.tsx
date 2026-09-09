import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createWorker } from "tesseract.js"
import {
  Home,
  History,
  Target,
  PieChart,
  Moon,
  Gamepad2,
  Settings as SettingsIcon,
  FileText,
  Wallet,
  Plus,
  Upload,
  Trash2,
  X,
  CalendarDays,
  PiggyBank,
  TrendingUp,
  ReceiptText,
  BarChart3,
  CheckCircle2,
  Bell,
  Printer,
} from "lucide-react"

/* =========================================================
   TYPES
========================================================= */

type TransactionType = "income" | "expense" | "savings" | "transfer"
type ExpenseGroup = "daily" | "monthly"

type Page =
  | "dashboard"
  | "goals"
  | "history"
  | "insights"
  | "settings"

type Transaction = {
  goalId?: string
  receipt?: ReceiptIdentity
  id: string
  description: string
  amount: number
  type: TransactionType
  category: string
  expenseGroup?: ExpenseGroup
  date: string
  createdAt: string
}

type Goal = {
  id: string
  name: string
  target: number
  current: number
  createdAt: string
  targetDate?: string
  openingCurrent?: number
}

type Budget = {
  id: string
  category: string
  limit: number
}

type AppSettings = {
  currency: string
  language: string
  nightlyReminder: boolean
  nightlyReminderTime: string
  dailyBudget: number
}

/* =========================================================
   STORAGE
========================================================= */

const RECEIPT_REGISTRY_KEY = "wealthquest-used-receipts"
const RECEIPT_REGISTRY_RESET_KEY = "wealthquest-used-receipts-last-reset"
const SNAPSHOT_KEY = "wealthquest-state-v2"
const TRANSACTION_STORAGE_KEY = "wealthquest-transactions"
const GOAL_STORAGE_KEY = "wealthquest-goals"
const BUDGET_STORAGE_KEY = "wealthquest-budgets"
const SETTINGS_STORAGE_KEY = "wealthquest-settings"
const LAST_NIGHTLY_NOTIFICATION_KEY = "wealthquest-last-nightly-notification"

/* =========================================================
   CATEGORIES
========================================================= */

const dailyExpenseCategories = [
  "Groceries",
  "Coffee / Café",
  "Food / Restaurants",
  "Transport",
  "Shopping",
  "Clothes",
  "Entertainment",
  "Health",
  "Personal Care",
  "Household",
  "Education",
  "Other",
]

const monthlyExpenseCategories = [
  "Rent",
  "Electricity",
  "Water",
  "Internet",
  "Mobile / Phone",
  "Subscriptions",
  "Loan / Installment",
  "Insurance",
  "School / Tuition",
  "Other Monthly Expense",
]

const incomeCategories = [
  "Salary",
  "Business Income",
  "Freelance",
  "Investment Income",
  "Bonus",
  "Gift",
  "Other Income",
]

const savingsCategories = [
  "General Savings",
  "Emergency Fund",
  "Travel",
  "House",
  "Car",
  "Education",
  "Investment",
  "Other Goal",
]

const allExpenseCategories = [
  "All Expenses",
  "Other",
  "Other Monthly Expense",
  ...dailyExpenseCategories.filter((item) => item !== "Other"),
  ...monthlyExpenseCategories.filter(
    (item) => item !== "Other Monthly Expense"
  ),
]

/* =========================================================
   NAVIGATION
========================================================= */

const NAV_ITEMS = [
  { id: "dashboard" as Page, label: "Home", icon: Home },
  { id: "goals" as Page, label: "Goals", icon: Target },
  { id: "history" as Page, label: "History", icon: History },
  { id: "insights" as Page, label: "Insights", icon: PieChart },
  { id: "settings" as Page, label: "Settings", icon: SettingsIcon },
]

const CURRENCY_OPTIONS = [
  ["MVR", "Maldivian Rufiyaa"],
  ["USD", "US Dollar"],
  ["EUR", "Euro"],
  ["GBP", "British Pound"],
  ["AED", "UAE Dirham"],
  ["AUD", "Australian Dollar"],
  ["BDT", "Bangladeshi Taka"],
  ["CAD", "Canadian Dollar"],
  ["CHF", "Swiss Franc"],
  ["CNY", "Chinese Yuan"],
  ["INR", "Indian Rupee"],
  ["JPY", "Japanese Yen"],
  ["LKR", "Sri Lankan Rupee"],
  ["MYR", "Malaysian Ringgit"],
  ["NPR", "Nepalese Rupee"],
  ["PKR", "Pakistani Rupee"],
  ["QAR", "Qatari Riyal"],
  ["SAR", "Saudi Riyal"],
  ["SGD", "Singapore Dollar"],
  ["THB", "Thai Baht"],
] as const

const LANGUAGE_OPTIONS = [
  ["en", "English"],
  ["dv", "Dhivehi / ދިވެހި"],
  ["ar", "Arabic / العربية"],
  ["hi", "Hindi / हिन्दी"],
  ["si", "Sinhala / සිංහල"],
  ["ta", "Tamil / தமிழ்"],
  ["bn", "Bengali / বাংলা"],
  ["ur", "Urdu / اردو"],
  ["zh", "Chinese / 中文"],
  ["es", "Spanish / Español"],
  ["fr", "French / Français"],
  ["de", "German / Deutsch"],
] as const

const RTL_LANGUAGES = new Set(["dv", "ar", "ur"])

/* =========================================================
   HELPERS
========================================================= */

function createId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key)

    if (!saved) {
      return fallback
    }

    return JSON.parse(saved) as T
  } catch {
    return fallback
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  currency: "MVR",
  language: "en",
  nightlyReminder: true,
  nightlyReminderTime: "21:30",
  dailyBudget: 0,
}

function loadSettings(): AppSettings {
  const saved = loadJSON<Partial<AppSettings>>(SETTINGS_STORAGE_KEY, {})

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    language:
      typeof saved.language === "string" &&
      LANGUAGE_OPTIONS.some(([code]) => code === saved.language)
        ? saved.language
        : DEFAULT_SETTINGS.language,
    nightlyReminderTime:
      typeof saved.nightlyReminderTime === "string" &&
      /^\d{2}:\d{2}$/.test(saved.nightlyReminderTime)
        ? saved.nightlyReminderTime
        : DEFAULT_SETTINGS.nightlyReminderTime,
    dailyBudget:
      typeof saved.dailyBudget === "number" &&
      Number.isFinite(saved.dailyBudget) &&
      saved.dailyBudget >= 0
        ? saved.dailyBudget
        : DEFAULT_SETTINGS.dailyBudget,
  }
}

function usagePercentage(current: number, target: number) {
  if (target <= 0) return 0
  return Math.max(0, (current / target) * 100)
}

function isSameLocalDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  )
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function sendBrowserNotification(title: string, body: string) {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return
  }

  try {
    new Notification(title, { body })
  } catch {
    // Some mobile browsers require a service worker for notifications.
  }
}

function normalizeTransaction(
  value: unknown,
  index: number
): Transaction | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const item = value as Record<string, unknown>

  const amount =
    typeof item.amount === "number"
      ? item.amount
      : Number(item.amount)

  const validTypes: TransactionType[] = [
    "income",
    "expense",
    "savings",
    "transfer",
  ]

  const type = validTypes.includes(
    item.type as TransactionType
  )
    ? (item.type as TransactionType)
    : null

  if (!type || !Number.isFinite(amount) || amount <= 0) {
    return null
  }

  const oldDescription =
    typeof item.description === "string"
      ? item.description.trim()
      : ""

  const category =
    typeof item.category === "string" &&
    item.category.trim()
      ? item.category.trim()
      : oldDescription || "Other"

  let createdAt = ""

  if (typeof item.createdAt === "string") {
    const parsed = new Date(item.createdAt)

    if (!Number.isNaN(parsed.getTime())) {
      createdAt = parsed.toISOString()
    }
  }

  if (!createdAt && typeof item.date === "string") {
    const parsed = new Date(item.date)

    if (!Number.isNaN(parsed.getTime())) {
      createdAt = parsed.toISOString()
    }
  }

  if (!createdAt) {
    createdAt = new Date().toISOString()
  }

  const validExpenseGroups: ExpenseGroup[] = [
    "daily",
    "monthly",
  ]

  const expenseGroup =
    type === "expense" &&
    validExpenseGroups.includes(
      item.expenseGroup as ExpenseGroup
    )
      ? (item.expenseGroup as ExpenseGroup)
      : undefined

  return {
    id:
      typeof item.id === "string"
        ? item.id
        : item.id !== undefined
          ? String(item.id)
          : `old-${index}-${Date.now()}`,

    receipt:
      item.receipt && typeof item.receipt === "object"
        ? (() => {
            const reference = (item.receipt as Record<string, unknown>).reference
            return typeof reference === "string" && reference.trim()
              ? { reference }
              : undefined
          })()
        : undefined,
    description: oldDescription || category,
    amount,
    type,
    category,
    expenseGroup,
    date: new Date(createdAt).toLocaleString(),
    createdAt,
  }
}

function loadTransactions(): Transaction[] {
  try {
    const saved = localStorage.getItem(
      TRANSACTION_STORAGE_KEY
    )

    if (!saved) {
      return []
    }

    const parsed: unknown = JSON.parse(saved)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map(normalizeTransaction)
      .filter(
        (transaction): transaction is Transaction =>
          transaction !== null
      )
  } catch {
    return []
  }
}

type Snapshot = { transactions: Transaction[]; goals: Goal[]; budgets: Budget[]; settings: AppSettings }
function loadSnapshot(): Snapshot {
  const saved = localStorage.getItem(SNAPSHOT_KEY)
  if (saved) {
    const data = JSON.parse(saved) as Snapshot
    if (!Array.isArray(data.transactions) || !Array.isArray(data.goals) || !Array.isArray(data.budgets) || !data.settings) {
      throw new Error("Saved data is invalid. Keep your browser data and restore a valid backup.")
    }
    return {
      ...data,
      settings: {
        ...DEFAULT_SETTINGS,
        ...data.settings,
        language:
          typeof data.settings.language === "string" &&
          LANGUAGE_OPTIONS.some(([code]) => code === data.settings.language)
            ? data.settings.language
            : DEFAULT_SETTINGS.language,
      },
    }
  }
  return { transactions: loadTransactions(), goals: loadJSON<Goal[]>(GOAL_STORAGE_KEY, []),
    budgets: loadJSON<Budget[]>(BUDGET_STORAGE_KEY, []), settings: loadSettings() }
}
function roundMoney(value: number) { return Math.round(value * 100) / 100 }
function goalProgress(goal: Goal, transactions: Transaction[]) {
  return roundMoney((goal.openingCurrent ?? goal.current) + transactions
    .filter(item => item.type === "savings" && item.goalId === goal.id)
    .reduce((sum, item) => sum + item.amount, 0))
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function percentage(current: number, target: number) {
  if (target <= 0) {
    return 0
  }

  return Math.min(100, Math.max(0, (current / target) * 100))
}

/* =========================================================
   SMALL UI COMPONENTS
========================================================= */

function Card({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`wq-card ${className}`}>
      {children}
    </div>
  )
}

function PageHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <div className="page-header">
      <h1>{title}</h1>

      {subtitle && <p>{subtitle}</p>}
    </div>
  )
}

function Modal({
  children,
  onClose,
}: {
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {children}
      </div>
    </div>
  )
}

/* =========================================================
   MAIN APP
========================================================= */

export default function App() {
  const [page, setPage] =
    useState<Page>("dashboard")

  const [snapshot, updateSnapshot] = useState<Snapshot>(loadSnapshot)
  const snapshotRef = useRef(snapshot)
  const diskRef = useRef(localStorage.getItem(SNAPSHOT_KEY))
  const [storageError, setStorageError] = useState("")
  function commit(next: Snapshot): boolean {
    try {
      if (localStorage.getItem(SNAPSHOT_KEY) !== diskRef.current) {
        throw new Error("Data changed in another tab. Refresh this tab before editing.")
      }
      const serialized = JSON.stringify(next)
      localStorage.setItem(SNAPSHOT_KEY, serialized)
      diskRef.current = serialized
      snapshotRef.current = next
      updateSnapshot(next)
      setStorageError("")
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : "Browser storage is unavailable."
      setStorageError(`Change not saved: ${message}`)
      alert(`Change not saved: ${message}`)
      return false
    }
  }
  function setField<K extends keyof Snapshot>(key: K, value: Snapshot[K] | ((previous: Snapshot[K]) => Snapshot[K])) {
    const previous = snapshotRef.current
    const next = typeof value === "function" ? (value as (p: Snapshot[K]) => Snapshot[K])(previous[key]) : value
    return commit({ ...previous, [key]: next })
  }
  const setTransactions = (value: Transaction[] | ((p: Transaction[]) => Transaction[])) => setField("transactions", value)
  const setGoals = (value: Goal[] | ((p: Goal[]) => Goal[])) => setField("goals", value)
  const setBudgets = (value: Budget[]) => setField("budgets", value)
  const setSettings = (value: AppSettings | ((p: AppSettings) => AppSettings)) => setField("settings", value)
  const { transactions, budgets, settings } = snapshot
  const goals = snapshot.goals.map(goal => ({ ...goal, openingCurrent: goal.openingCurrent ?? goal.current,
    current: goalProgress(goal, transactions) }))
  const [todayKey, setTodayKey] = useState(() => localDateKey(new Date()))
  useEffect(() => {
    const timer = window.setInterval(() => setTodayKey(localDateKey(new Date())), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    document.documentElement.lang = settings.language
    document.documentElement.dir = RTL_LANGUAGES.has(settings.language) ? "rtl" : "ltr"
  }, [settings.language])

  const [showAddTransaction, setShowAddTransaction] =
    useState(false)

  const [showScan, setShowScan] = useState(false)

  /* =======================================================
     SAVE DATA
  ======================================================= */

  useEffect(() => {
    try {
      cleanupReceiptRegistryIfExpired()
      migrateLegacyReceiptReferences(transactions)

      // Receipt references belong only in the duplicate registry.
      // Strip any references saved by older WealthQuest versions.
      setTransactions((previous) =>
        previous.map((transaction) =>
          transaction.receipt
            ? { ...transaction, receipt: undefined }
            : transaction
        )
      )
    } catch {
      // A later save will show a storage error if browser storage is unavailable.
    }
    // This migration intentionally runs once when the app starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!settings.nightlyReminder) return

    const checkReminder = () => {
      if (
        typeof window === "undefined" ||
        !("Notification" in window) ||
        Notification.permission !== "granted"
      ) {
        return
      }

      const current = new Date()
      const [hourText, minuteText] = settings.nightlyReminderTime.split(":")
      const reminderMinutes =
        Number(hourText) * 60 + Number(minuteText)
      const currentMinutes =
        current.getHours() * 60 + current.getMinutes()

      if (!Number.isFinite(reminderMinutes) || currentMinutes < reminderMinutes) {
        return
      }

      const todayKey = localDateKey(current)
      if (localStorage.getItem(LAST_NIGHTLY_NOTIFICATION_KEY) === todayKey) {
        return
      }

      sendBrowserNotification(
        "WealthQuest nightly review",
        "Take a minute to add anything you spent or saved today."
      )
      localStorage.setItem(LAST_NIGHTLY_NOTIFICATION_KEY, todayKey)
    }

    checkReminder()
    const timer = window.setInterval(checkReminder, 60_000)
    return () => window.clearInterval(timer)
  }, [settings.nightlyReminder, settings.nightlyReminderTime])

  /* =======================================================
     CURRENT MONTH
  ======================================================= */

  const now = new Date()

  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const monthName = now.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  })

  const monthOnly = now.toLocaleString("en-US", {
    month: "long",
  })

  const monthlyTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const date = new Date(transaction.createdAt)

      return (
        date.getMonth() === currentMonth &&
        date.getFullYear() === currentYear
      )
    })
  }, [transactions, currentMonth, currentYear])

  /* =======================================================
     TOTALS
  ======================================================= */

  const totals = useMemo(() => {
    const monthlyIncome = monthlyTransactions
      .filter((item) => item.type === "income")
      .reduce(
        (total, item) => total + item.amount,
        0
      )

    const monthlyExpenses = monthlyTransactions
      .filter((item) => item.type === "expense")
      .reduce(
        (total, item) => total + item.amount,
        0
      )

    const dailyExpenses = monthlyTransactions
      .filter(
        (item) =>
          item.type === "expense" &&
          item.expenseGroup === "daily"
      )
      .reduce(
        (total, item) => total + item.amount,
        0
      )

    const monthlyBills = monthlyTransactions
      .filter(
        (item) =>
          item.type === "expense" &&
          item.expenseGroup === "monthly"
      )
      .reduce(
        (total, item) => total + item.amount,
        0
      )

    const monthlySavings = monthlyTransactions
      .filter((item) => item.type === "savings")
      .reduce(
        (total, item) => total + item.amount,
        0
      )

    const totalIncome = transactions
      .filter((item) => item.type === "income")
      .reduce(
        (total, item) => total + item.amount,
        0
      )

    const totalExpenses = transactions
      .filter((item) => item.type === "expense")
      .reduce(
        (total, item) => total + item.amount,
        0
      )

    const totalSavings = transactions
      .filter((item) => item.type === "savings")
      .reduce(
        (total, item) => total + item.amount,
        0
      )

    return {
      monthlyIncome,
      monthlyExpenses,
      dailyExpenses,
      monthlyBills,
      monthlySavings,
      totalSavings,

      // Available spending money is based on the current month and never displays below zero.
      availableBalance: Math.max(
        0,
        monthlyIncome - monthlyExpenses - monthlySavings
      ),

      overspentAmount: Math.max(
        0,
        monthlyExpenses + monthlySavings - monthlyIncome
      ),

      availablePercent:
        monthlyIncome > 0
          ? Math.max(
              0,
              Math.min(
                100,
                ((monthlyIncome - monthlyExpenses - monthlySavings) / monthlyIncome) * 100
              )
            )
          : 0,

      netMoneyOwned:
        totalIncome - totalExpenses,
    }
  }, [transactions, monthlyTransactions])

  const todaysDailyExpenses = useMemo(() => {
    const today = new Date()

    return transactions
      .filter((item) => {
        if (
          item.type !== "expense" ||
          item.expenseGroup !== "daily"
        ) {
          return false
        }

        const itemDate = new Date(item.createdAt)
        return !Number.isNaN(itemDate.getTime()) && isSameLocalDay(itemDate, today)
      })
      .reduce((total, item) => total + item.amount, 0)
  }, [transactions, todayKey])

  const dailyBudgetUsed =
    settings.dailyBudget > 0
      ? usagePercentage(todaysDailyExpenses, settings.dailyBudget)
      : 0

  /* =======================================================
     CATEGORY TOTALS
  ======================================================= */

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {}

    monthlyTransactions
      .filter((item) => item.type === "expense")
      .forEach((item) => {
        map[item.category] =
          (map[item.category] || 0) +
          item.amount
      })

    return Object.entries(map)
      .map(([category, amount]) => ({
        category,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [monthlyTransactions])

  const budgetAlerts = useMemo(() => {
    return budgets
      .map((budget) => {
        const spent =
          budget.category === "All Expenses" ? totals.monthlyExpenses : categoryTotals.find(
            (item) => item.category === budget.category
          )?.amount || 0

        const used = usagePercentage(spent, budget.limit)

        return { ...budget, spent, used }
      })
      .filter((item) => item.used >= 80)
      .sort((a, b) => b.used - a.used)
  }, [budgets, categoryTotals, totals.monthlyExpenses])

  /* =======================================================
     GAME VALUES
  ======================================================= */

  const rewards = useMemo(() => calculateRewards(transactions), [transactions])
  const xp = rewards.total

  const level = Math.floor(xp / 100) + 1
  const levelProgress = xp % 100

  /* =======================================================
     TRANSACTION ACTIONS
  ======================================================= */

  function addTransaction(transaction: Transaction): boolean {
    transaction.amount = roundMoney(transaction.amount)
    if (!Number.isFinite(transaction.amount) || transaction.amount < 0.01 || !Number.isSafeInteger(Math.round(transaction.amount * 100))) {
      alert("Enter an amount of at least 0.01 within the supported range.")
      return false
    }
    let used: Set<string>

    try {
      cleanupReceiptRegistryIfExpired()
      used = usedReceiptKeys()

      if (
        receiptKeys(transaction.receipt).some((key) =>
          used.has(key)
        )
      ) {
        alert(
          "This receipt reference was already used. It cannot be added again. No transaction or points were added."
        )
        return false
      }
    } catch {
      alert(
        "Cannot check saved receipt references. Please restore access to browser storage before saving."
      )
      return false
    }

    if (transaction.receipt) {
      const duplicate = receiptDuplicate(
        transaction.receipt,
        transaction.amount,
        transactions
      )

      if (
        duplicate.possible &&
        !window.confirm(
          "A saved slip has the same amount, date and recipient. Is this a different payment? Cancel to avoid adding it twice."
        )
      ) {
        return false
      }
    }

    // Keep financial data in transaction history, but keep receipt references
    // only in the separate duplicate registry.
    const storedTransaction: Transaction = {
      ...transaction,
      receipt: undefined,
    }

    const next = [storedTransaction, ...transactions]
    const budgetMessages: string[] = []

    if (storedTransaction.type === "expense") {
      const transactionDate = new Date(storedTransaction.createdAt)
      const current = new Date()
      const isCurrentMonth =
        transactionDate.getMonth() === currentMonth &&
        transactionDate.getFullYear() === currentYear

      for (const budget of budgets.filter(item => item.category === storedTransaction.category || item.category === "All Expenses")) {
      if (isCurrentMonth) {
        const previousSpent = monthlyTransactions
          .filter(
            (item) =>
              item.type === "expense" &&
              (budget.category === "All Expenses" || item.category === storedTransaction.category)
          )
          .reduce((total, item) => total + item.amount, 0)

        const nextSpent = previousSpent + storedTransaction.amount
        const previousUsed = usagePercentage(previousSpent, budget.limit)
        const nextUsed = usagePercentage(nextSpent, budget.limit)

        if (previousUsed < 100 && nextUsed >= 100) {
          budgetMessages.push(
            `${budget.category} budget limit reached or exceeded: ${nextUsed.toFixed(0)}% used (${formatMoney(nextSpent, settings.currency)} of ${formatMoney(budget.limit, settings.currency)}).`
          )
        } else if (previousUsed < 80 && nextUsed >= 80) {
          budgetMessages.push(
            `${budget.category} budget warning: ${nextUsed.toFixed(0)}% used (${formatMoney(nextSpent, settings.currency)} of ${formatMoney(budget.limit, settings.currency)}).`
          )
        }
      }

      }
      if (
        storedTransaction.expenseGroup === "daily" &&
        settings.dailyBudget > 0 &&
        isSameLocalDay(transactionDate, current)
      ) {
        const previousDailySpent = transactions
          .filter((item) => {
            if (
              item.type !== "expense" ||
              item.expenseGroup !== "daily"
            ) {
              return false
            }

            const itemDate = new Date(item.createdAt)
            return !Number.isNaN(itemDate.getTime()) && isSameLocalDay(itemDate, current)
          })
          .reduce((total, item) => total + item.amount, 0)

        const nextDailySpent = previousDailySpent + storedTransaction.amount
        const previousDailyUsed = usagePercentage(
          previousDailySpent,
          settings.dailyBudget
        )
        const nextDailyUsed = usagePercentage(
          nextDailySpent,
          settings.dailyBudget
        )

        if (previousDailyUsed < 100 && nextDailyUsed >= 100) {
          budgetMessages.push(
            `Daily spending budget limit reached or exceeded: ${nextDailyUsed.toFixed(0)}% used (${formatMoney(nextDailySpent, settings.currency)} of ${formatMoney(settings.dailyBudget, settings.currency)}).`
          )
        } else if (previousDailyUsed < 80 && nextDailyUsed >= 80) {
          budgetMessages.push(
            `Daily spending warning: ${nextDailyUsed.toFixed(0)}% used (${formatMoney(nextDailySpent, settings.currency)} of ${formatMoney(settings.dailyBudget, settings.currency)}).`
          )
        }
      }
    }

    try {
      const previousRegistry = localStorage.getItem(RECEIPT_REGISTRY_KEY)
      rememberReceiptKeys(transaction.receipt)

      try {
        if (!setTransactions(next)) throw new Error("Transaction save failed")
      } catch (error) {
        if (previousRegistry === null) {
          localStorage.removeItem(RECEIPT_REGISTRY_KEY)
        } else {
          localStorage.setItem(RECEIPT_REGISTRY_KEY, previousRegistry)
        }
        throw error
      }
    } catch {
      alert(
        "Could not save this transaction. Browser storage may be full or unavailable. No points were added."
      )
      return false
    }

    setShowAddTransaction(false)

    if (budgetMessages.length > 0) {
      const message = budgetMessages.join("\n\n")
      window.setTimeout(() => alert(message), 0)
      sendBrowserNotification("WealthQuest budget alert", message)
    }

    return true
  }

  function deleteTransaction(id: string) {
    if (
      !window.confirm(
        "Delete this transaction? If it came from a scanned receipt, that receipt reference remains blocked. Deleting a goal contribution also reduces that goal’s progress."
      )
    ) {
      return
    }

    setTransactions((previous) =>
      previous.filter(
        (transaction) =>
          transaction.id !== id
      )
    )
  }

  /* =======================================================
     PAGE RENDERING
  ======================================================= */

  function renderDashboard() {
    const money = (amount: number) => formatMoney(amount, settings.currency)
    const hasMonthlyIncome = totals.monthlyIncome > 0
    const balanceIsCritical = hasMonthlyIncome && totals.availablePercent <= 20
    const balanceNeedsAttention =
      hasMonthlyIncome && totals.availablePercent > 20 && totals.availablePercent <= 40

    const scrollToBudgets = () =>
      document.getElementById("budget-manager")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })

    const today = new Date()
    const todaysTransactions = transactions.filter((transaction) => {
      const date = new Date(transaction.createdAt)
      return !Number.isNaN(date.getTime()) && isSameLocalDay(date, today)
    })
    const todaysExpenses = todaysTransactions
      .filter((item) => item.type === "expense")
      .reduce((sum, item) => sum + item.amount, 0)

    return (
      <div className="lagoon-dashboard">
        <section className="lagoon-hero lagoon-hero-compact" aria-label="WealthQuest overview">
          <svg className="lagoon-waves" viewBox="0 0 800 250" preserveAspectRatio="none" aria-hidden="true">
            <path d="M350 250C470 110 510 230 620 110S760 50 800 0V250Z" fill="currentColor" opacity=".07" />
            <path d="M180 250C370 130 430 270 620 170S760 100 800 95V250Z" fill="currentColor" opacity=".08" />
            <path d="M400 250C530 205 580 260 700 200S770 160 800 170V250Z" fill="currentColor" opacity=".09" />
          </svg>

          <div className="lagoon-hero-copy lagoon-hero-intro">
            <span className="lagoon-eyebrow">{monthOnly} Overview</span>
            <h1>{money(totals.availableBalance)}</h1>
            <p>
              {hasMonthlyIncome
                ? `${totals.availablePercent.toFixed(0)}% of your income remaining`
                : "0% of your income remaining"}
            </p>
          </div>

          <div className="lagoon-hero-side">
            <span className="lagoon-date"><CalendarDays size={16} />{monthName}</span>
            <div className="lagoon-hero-actions">
              <button className="primary-button" onClick={() => setShowAddTransaction(true)}><Plus size={18} />Add Transaction</button>
              <button className="secondary-button" onClick={() => setShowScan(true)}><Upload size={18} />Scan Slip</button>
            </div>
          </div>
        </section>
        <div className="stats-grid">
          <Card
            className={
              balanceIsCritical
                ? "balance-card balance-critical"
                : balanceNeedsAttention
                  ? "balance-card balance-warning"
                  : "balance-card"
            }
          >
            <div className="lagoon-stat-top"><span className="stat-label">Available Balance</span><Wallet size={18} /></div>
            <strong className="stat-value">{money(totals.availableBalance)}</strong>
            <p className="lagoon-stat-note">
              {hasMonthlyIncome
                ? `${totals.availablePercent.toFixed(0)}% of this month’s income remaining`
                : "Add monthly income to calculate your spending balance"}
            </p>
            {totals.overspentAmount > 0 && (
              <p className="balance-overspent">Overspent by {money(totals.overspentAmount)}</p>
            )}
          </Card>

          {[
            { label: "Monthly Income", amount: totals.monthlyIncome, Icon: TrendingUp, note: "Received this month" },
            { label: "Monthly Expenses", amount: totals.monthlyExpenses, Icon: ReceiptText, note: "Spent this month" },
            { label: "Total Savings", amount: totals.totalSavings, Icon: PiggyBank, note: "Set aside across all months" },
          ].map(({label, amount, Icon, note}) => <Card key={label}>
            <div className="lagoon-stat-top"><span className="stat-label">{label}</span><Icon size={18} /></div>
            <strong className="stat-value">{money(amount)}</strong><p className="lagoon-stat-note">{note}</p>
          </Card>)}
        </div>

        {balanceIsCritical && (
          <div className="lagoon-alert lagoon-alert-danger" role="alert">
            <Bell size={20} />
            <div>
              <strong>Low available balance</strong>
              <p>
                {totals.overspentAmount > 0
                  ? `No available spending balance remains. You are over by ${money(totals.overspentAmount)} this month.`
                  : `Only ${money(totals.availableBalance)} remains — ${totals.availablePercent.toFixed(0)}% of this month’s income.`}
              </p>
            </div>
          </div>
        )}

        {budgetAlerts.length > 0 && <div className="lagoon-alert" role="status">
          <Bell size={20} /><div><strong>Your budgets need a look</strong>
            <p>{budgetAlerts.map(item => `${item.category}: ${item.used.toFixed(0)}% used`).join(" · ")}</p></div>
          <button className="text-button" onClick={scrollToBudgets}>View budgets →</button>
        </div>}
        <div className="lagoon-columns">
          <Card>
            <div className="section-title-row"><div><span className="lagoon-eyebrow">ONE DAY AT A TIME</span><h2>Daily Spending Budget</h2></div>
              <button className="text-button" onClick={scrollToBudgets}>{settings.dailyBudget > 0 ? "Edit budget" : "Set budget"}</button></div>
            {settings.dailyBudget > 0 ? <>
              <div className="lagoon-budget-number"><strong>{money(todaysDailyExpenses)}</strong><span>of {money(settings.dailyBudget)}</span></div>
              <div className="progress-track" role="progressbar" aria-label="Daily budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, dailyBudgetUsed)} aria-valuetext={`${dailyBudgetUsed.toFixed(0)} percent used`}>
                <div className={dailyBudgetUsed >= 100 ? "progress-fill over" : "progress-fill"} style={{width: `${Math.min(100, dailyBudgetUsed)}%`}} /></div>
              <p className={dailyBudgetUsed >= 80 ? "lagoon-warning" : "small-muted"}>{dailyBudgetUsed.toFixed(0)}% used · {dailyBudgetUsed > 100 ? "Above your daily limit" : dailyBudgetUsed === 100 ? "Daily limit reached" : dailyBudgetUsed >= 80 ? "Getting close to your limit" : "Within your daily limit"}</p>
            </> : <EmptyState text="Choose a daily limit. We’ll let you know when you reach 80% and 100%." />}
            <div className="lagoon-divider" />
            <h3>This month’s spending</h3><div className="summary-list">
              <div><span>Daily Expenses</span><strong>{money(totals.dailyExpenses)}</strong></div>
              <div><span>Monthly Bills</span><strong>{money(totals.monthlyBills)}</strong></div>
            </div>
          </Card>
          <Card>
            <div className="section-title-row"><div><span className="lagoon-eyebrow">YOUR NEXT CHAPTER</span><h2>Savings Goals</h2></div>
              <button className="text-button" onClick={() => setPage("goals")}>{goals.length ? "View goals" : "Create goal"}</button></div>
            {goals.length ? <div className="lagoon-goals">{goals.slice(0,3).map(goal => {
              const progress = percentage(goal.current, goal.target)
              return <div className="lagoon-goal" key={goal.id}>
                <div className="lagoon-goal-name"><span className="lagoon-goal-icon"><Target size={18} /></span><strong>{goal.name}</strong><span>{progress.toFixed(0)}%</span></div>
                <div className="progress-track" role="progressbar" aria-label={`${goal.name} savings progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="progress-fill" style={{width:`${progress}%`}} /></div>
                <p>{money(goal.current)} <span>of {money(goal.target)}</span></p>
              </div>
            })}</div> : <div className="lagoon-goal-empty"><Target size={32} /><h3>Something worth saving for.</h3><p>A laptop, a trip, a little peace of mind.<br />Give your next goal a place to grow.</p><button className="secondary-button" onClick={() => setPage("goals")}><Plus size={16} />Create your first goal</button></div>}
            <div className="lagoon-savings-note"><PiggyBank size={18} /><span>{money(totals.monthlySavings)} saved this month</span></div>
          </Card>
        </div>
        <Card>
          <div className="section-title-row"><div><span className="lagoon-eyebrow">THE EVERYDAY DETAILS</span><h2>Recent Transactions</h2><p>Your latest income, spending and savings.</p></div>
            <button className="text-button" onClick={() => setPage("history")}>View all →</button></div>
          {transactions.length ? <TransactionList transactions={transactions.slice(0,5)} currency={settings.currency} onDelete={deleteTransaction} /> : <EmptyState text="Your story starts with one transaction. Add it above or scan a slip." />}
        </Card>
        <Card className="home-review-card">
          <div className="section-title-row">
            <div>
              <span className="lagoon-eyebrow">END-OF-DAY CHECK</span>
              <h2 className="icon-heading"><Moon size={20} /> Today’s Review</h2>
              <p>You added <strong>{todaysTransactions.length}</strong> transaction{todaysTransactions.length === 1 ? "" : "s"} today and spent <strong>{money(todaysExpenses)}</strong>.</p>
            </div>
            <button className="secondary-button" onClick={() => setShowAddTransaction(true)}>
              <Plus size={17} /> Add anything I missed
            </button>
          </div>
        </Card>

        <section id="budget-manager" className="home-budget-manager">
          <div className="section-title-row home-section-heading">
            <div>
              <span className="lagoon-eyebrow">PLAN BEFORE YOU SPEND</span>
              <h2><BarChart3 size={20} /> Budget Manager</h2>
              <p>Set your daily limit and monthly category budgets without leaving Home.</p>
            </div>
          </div>
          <BudgetsPage
            embedded
            budgets={budgets}
            categoryTotals={[...categoryTotals, {category: "All Expenses", amount: totals.monthlyExpenses}]}
            currency={settings.currency}
            onChange={setBudgets}
            dailyBudget={settings.dailyBudget}
            todaysDailyExpenses={todaysDailyExpenses}
            onDailyBudgetChange={(dailyBudget) =>
              setSettings((previous) => ({ ...previous, dailyBudget }))
            }
          />
        </section>

        <div className="lagoon-footer"><span>Small steps. A brighter horizon.</span><span>Net money owned <strong>{money(totals.netMoneyOwned)}</strong></span></div>
      </div>
    )
  }

  function renderHistory() {
    return (
      <>
        <PageHeader
          title="Transaction History"
          subtitle="All income, expenses and savings"
        />

        <div className="quick-actions">
          <button
            className="primary-button"
            onClick={() =>
              setShowAddTransaction(true)
            }
          >
            <Plus size={18} />
            Add Transaction
          </button>
        </div>

        <Card>
          {transactions.length === 0 ? (
            <EmptyState
              text="No transactions added yet."
            />
          ) : (
            <TransactionList
              transactions={transactions}
              currency={settings.currency}
              onDelete={deleteTransaction}
            />
          )}
        </Card>
      </>
    )
  }

  function renderGoals() {
    return (
      <GoalsPage
        goals={goals}
        currency={settings.currency}
        onChange={setGoals}
        onAddSavings={(goalId, goalName, amount) => {
          const goal = goals.find(item => item.id === goalId)
          const rounded = roundMoney(amount)
          if (!goal || !Number.isFinite(rounded) || rounded < 0.01 || rounded > roundMoney(goal.target - goal.current)) return false
          const now = new Date()
          return addTransaction({ id: createId(), goalId, description: goalName,
            amount: rounded, type: "savings", category: goalName,
            date: now.toLocaleString(), createdAt: now.toISOString() })
        }}
      />
    )
  }

  function renderInsights() {
    const topCategory =
      categoryTotals.length > 0
        ? categoryTotals[0]
        : null

    const savingsRate =
      totals.monthlyIncome > 0
        ? (totals.monthlySavings / totals.monthlyIncome) * 100
        : 0

    return (
      <>
        <PageHeader
          title="Insights"
          subtitle="Trends, reports and a clearer view of your money"
        />

        <div className="stats-grid">
          <Card>
            <span className="stat-label">Daily Spending</span>
            <strong className="stat-value">{formatMoney(totals.dailyExpenses, settings.currency)}</strong>
          </Card>
          <Card>
            <span className="stat-label">Fixed Monthly Bills</span>
            <strong className="stat-value">{formatMoney(totals.monthlyBills, settings.currency)}</strong>
          </Card>
          <Card>
            <span className="stat-label">Savings Rate</span>
            <strong className="stat-value">{savingsRate.toFixed(1)}%</strong>
          </Card>
          <Card>
            <span className="stat-label">Top Expense</span>
            <strong className="stat-value small">{topCategory ? topCategory.category : "No data"}</strong>
          </Card>
        </div>

        <Card>
          <h2>Spending by Category</h2>
          {categoryTotals.length === 0 ? (
            <EmptyState text="Add expenses to see insights." />
          ) : (
            <div className="category-list">
              {categoryTotals.map((item) => {
                const ratio =
                  totals.monthlyExpenses > 0
                    ? (item.amount / totals.monthlyExpenses) * 100
                    : 0

                return (
                  <div className="category-row" key={item.category}>
                    <div className="category-row-top">
                      <span>{item.category}</span>
                      <strong>{formatMoney(item.amount, settings.currency)}</strong>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${Math.min(ratio, 100)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card className="insights-report-card">
          <div className="section-title-row">
            <div>
              <span className="lagoon-eyebrow">MONTHLY REPORT</span>
              <h2><FileText size={20} /> {monthName}</h2>
              <p>Your report now lives inside Insights.</p>
            </div>
            <button className="secondary-button no-print" onClick={() => window.print()}>
              <Printer size={17} /> Print / Save as PDF
            </button>
          </div>

          <div className="report-grid">
            <div><span>Income</span><strong>{formatMoney(totals.monthlyIncome, settings.currency)}</strong></div>
            <div><span>Expenses</span><strong>{formatMoney(totals.monthlyExpenses, settings.currency)}</strong></div>
            <div><span>Daily Expenses</span><strong>{formatMoney(totals.dailyExpenses, settings.currency)}</strong></div>
            <div><span>Monthly Bills</span><strong>{formatMoney(totals.monthlyBills, settings.currency)}</strong></div>
            <div><span>Savings</span><strong>{formatMoney(totals.monthlySavings, settings.currency)}</strong></div>
            <div><span>Available</span><strong>{formatMoney(totals.availableBalance, settings.currency)}</strong></div>
          </div>
        </Card>
      </>
    )
  }

  function renderSettings() {
    return (
      <>
        <PageHeader
          title="Settings"
          subtitle="Customize WealthQuest"
        />

        <div className="settings-grid">
          <Card>
            <h2>Currency</h2>
            <p className="small-muted">Changing this changes the currency label only. Existing amounts are not converted.</p>
            <select
              className="input"
              value={settings.currency}
              onChange={(event) =>
                setSettings((previous) => ({ ...previous, currency: event.target.value }))
              }
            >
              {CURRENCY_OPTIONS.map(([code, name]) => (
                <option key={code} value={code}>{code} — {name}</option>
              ))}
            </select>
          </Card>

          <Card>
            <h2>Language</h2>
            <p className="small-muted">Choose your preferred app language. The preference and text direction are saved now; full translated copy can be connected language-by-language.</p>
            <select
              className="input"
              value={settings.language}
              onChange={(event) =>
                setSettings((previous) => ({ ...previous, language: event.target.value }))
              }
            >
              {LANGUAGE_OPTIONS.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </Card>
        </div>

        <Card>
          <h2 className="icon-heading"><Moon size={20} /> Nightly Review</h2>
          <label className="toggle-row">
            <div>
              <strong>Nightly reminder</strong>
              <p>Keep your daily money records up to date.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.nightlyReminder}
              onChange={(event) =>
                setSettings((previous) => ({ ...previous, nightlyReminder: event.target.checked }))
              }
            />
          </label>

          <label className="field-label" htmlFor="nightly-time">Reminder time</label>
          <input
            id="nightly-time"
            className="input"
            type="time"
            value={settings.nightlyReminderTime}
            onChange={(event) =>
              setSettings((previous) => ({
                ...previous,
                nightlyReminderTime: event.target.value || "21:30",
              }))
            }
          />

          <div className="quick-actions">
            <button
              className="secondary-button"
              onClick={async () => {
                if (!("Notification" in window)) {
                  alert("This browser does not support notifications.")
                  return
                }
                const permission = await Notification.requestPermission()
                if (permission === "granted") {
                  sendBrowserNotification(
                    "WealthQuest notifications enabled",
                    "Budget alerts and nightly reminders can now appear while this web app is running."
                  )
                } else {
                  alert("Notification permission was not granted.")
                }
              }}
            >
              <Bell size={17} /> Enable Browser Notifications
            </button>
          </div>
          <p className="small-muted">Browser reminders work while WealthQuest is running. Reliable notifications when the app is fully closed will need the later mobile/PWA notification system.</p>
        </Card>

        <Card>
          <div className="section-title-row">
            <div>
              <span className="lagoon-eyebrow">GAMIFICATION</span>
              <h2 className="icon-heading"><Gamepad2 size={20} /> WealthQuest World</h2>
              <p>World now lives in Settings instead of taking a main navigation slot.</p>
            </div>
          </div>

          <div className="game-level">
            <div className="level-badge">{level}</div>
            <div className="level-details">
              <span>Level {level}</span>
              <strong>{xp} XP</strong>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${levelProgress}%` }} /></div>
              <small>{100 - levelProgress} XP until the next level</small>
            </div>
          </div>

          <div className="world-rules">
            <p>Expense logging: 5 points per day, regardless of spending or receipt count.</p>
            <p>Savings: 50 points once per month when savings reach 20% of that month’s recorded income.</p>
            <p>Income and own-account transfers earn no points. Rewards recalculate when entries change or are deleted.</p>
          </div>
        </Card>

        <div className="achievement-grid settings-achievements">
          <Card>
            <PiggyBank size={28} />
            <h3>Saver</h3>
            <p>Save 20% of monthly income to earn 50 points.</p>
            {totals.monthlyIncome > 0 && totals.monthlySavings >= totals.monthlyIncome * 0.2 && (
              <span className="achievement-earned"><CheckCircle2 size={16} /> 20% target reached</span>
            )}
          </Card>
          <Card>
            <ReceiptText size={28} />
            <h3>Tracker</h3>
            <p>Keep recording your transactions.</p>
            {transactions.length >= 5 && (
              <span className="achievement-earned"><CheckCircle2 size={16} /> Earned</span>
            )}
          </Card>
          <Card>
            <TrendingUp size={28} />
            <h3>Money Builder</h3>
            <p>Keep some available spending balance.</p>
            {totals.availableBalance > 0 && (
              <span className="achievement-earned"><CheckCircle2 size={16} /> Earned</span>
            )}
          </Card>
        </div>

        <Card>
          <h2>Data</h2>
          <p className="muted">Your current version stores data locally in this browser.</p>
          <p className="small-muted">Clearing financial data does not erase the permanent receipt-reference registry.</p>
          <button
            className="danger-button"
            onClick={() => {
              if (!window.confirm(
                "Delete your WealthQuest financial data, goals, budgets and settings? Receipt references used for duplicate protection will remain blocked."
              )) return

              if (commit({transactions: [], goals: [], budgets: [], settings: DEFAULT_SETTINGS})) {
                try {
                  for (const key of [TRANSACTION_STORAGE_KEY, GOAL_STORAGE_KEY, BUDGET_STORAGE_KEY, SETTINGS_STORAGE_KEY, LAST_NIGHTLY_NOTIFICATION_KEY]) localStorage.removeItem(key)
                } catch { /* The authoritative snapshot has already been saved. */ }
              }
            }}
          >
            <Trash2 size={17} /> Clear Local Data
          </button>
        </Card>
      </>
    )
  }

  function renderPage() {
    switch (page) {
      case "goals":
        return renderGoals()
      case "history":
        return renderHistory()
      case "insights":
        return renderInsights()
      case "settings":
        return renderSettings()
      default:
        return renderDashboard()
    }
  }

  /* =======================================================
     APP UI
  ======================================================= */

  return (
    <>
      <style>{APP_CSS}</style>

      <div className="app-shell lagoon">
        {/* DESKTOP SIDEBAR */}

        <aside className="sidebar">
          <div className="brand">
            <div className="brand-logo">
              <img
                src="/wealthquest-icon.png"
                alt="WealthQuest"
                className="wealthquest-brand-image"
              />
            </div>

            <div>
              <strong>WealthQuest</strong>

              <span>
                Level {level} · {xp} XP
              </span>
            </div>
          </div>

          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon

              return (
                <button
                  key={item.id}
                  className={
                    page === item.id
                      ? "nav-button active"
                      : "nav-button"
                  }
                  onClick={() =>
                    setPage(item.id)
                  }
                >
                  <Icon size={19} />
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div className="sidebar-actions">
            <button
              className="primary-button"
              onClick={() =>
                setShowAddTransaction(true)
              }
            >
              <Plus size={17} />
              Add Transaction
            </button>

            <button
              className="secondary-button"
              onClick={() =>
                setShowScan(true)
              }
            >
              <Upload size={17} />
              Scan
            </button>
          </div>
        </aside>

        {/* MAIN */}

        <main className="main-area">
          {/* MOBILE HEADER */}

          <header className="mobile-header">
            <div className="mobile-brand">
              <div className="brand-logo small">
                <img
                  src="/wealthquest-icon.png"
                  alt="WealthQuest"
                  className="wealthquest-brand-image"
                />
              </div>

              <strong>WealthQuest</strong>
            </div>

            <span className="level-pill">
              Lv {level} · {xp} XP
            </span>
          </header>

          <div className="content">
            {storageError && <p role="alert">{storageError}</p>}
            {renderPage()}
          </div>
        </main>

        {/* MOBILE NAV */}

        <nav className="mobile-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon

            return (
              <button
                key={item.id}
                className={
                  page === item.id
                    ? "mobile-nav-button active"
                    : "mobile-nav-button"
                }
                onClick={() =>
                  setPage(item.id)
                }
              >
                <Icon size={20} />

                <span>
                  {item.label}
                </span>
              </button>
            )
          })}
        </nav>

        {/* ADD TRANSACTION */}

        {showAddTransaction && (
          <AddTransactionModal
            onClose={() =>
              setShowAddTransaction(false)
            }
            onAdd={addTransaction}
            currency={settings.currency}
          />
        )}

        {/* SCAN */}

        {showScan && (
          <ScanSlipModal
            onClose={() => setShowScan(false)}
            onAdd={(transaction) => {
              const saved = addTransaction(transaction)
              if (saved) setShowScan(false)
              return saved
            }}
            currency={settings.currency}
          />
        )}
      </div>
    </>
  )
}

function receiptKeys(receipt?: ReceiptIdentity): string[] {
  if (!receipt?.reference) return []

  const reference = receipt.reference
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")

  return reference ? [`reference:${reference}`] : []
}

type ReceiptRegistryEntry = {
  key: string
  savedAt: number
}

function readReceiptRegistry(): ReceiptRegistryEntry[] {
  const now = Date.now()
  const raw = JSON.parse(
    localStorage.getItem(RECEIPT_REGISTRY_KEY) || "[]"
  ) as unknown

  if (!Array.isArray(raw)) {
    throw new Error("Receipt registry unavailable")
  }

  const legacySavedAt = Number(
    localStorage.getItem(RECEIPT_REGISTRY_RESET_KEY) || String(now)
  )
  const fallbackSavedAt = Number.isFinite(legacySavedAt)
    ? legacySavedAt
    : now

  const entries: ReceiptRegistryEntry[] = []

  for (const item of raw) {
    if (typeof item === "string") {
      if (item.startsWith("reference:")) {
        entries.push({ key: item, savedAt: fallbackSavedAt })
      }
      continue
    }

    if (
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).key === "string" &&
      typeof (item as Record<string, unknown>).savedAt === "number"
    ) {
      const key = (item as { key: string }).key
      const savedAt = (item as { savedAt: number }).savedAt

      if (key.startsWith("reference:") && Number.isFinite(savedAt)) {
        entries.push({ key, savedAt })
      }
    }
  }

  const active = entries

  const deduped = new Map<string, ReceiptRegistryEntry>()
  active.forEach((entry) => {
    const existing = deduped.get(entry.key)
    if (!existing || entry.savedAt < existing.savedAt) {
      deduped.set(entry.key, entry)
    }
  })

  const result = [...deduped.values()]
  localStorage.setItem(RECEIPT_REGISTRY_KEY, JSON.stringify(result))
  localStorage.removeItem(RECEIPT_REGISTRY_RESET_KEY)
  return result
}

function cleanupReceiptRegistryIfExpired() {
  try {
    readReceiptRegistry()
  } catch {
    // Saving a scanned transaction will surface a storage problem to the user.
  }
}

function usedReceiptKeys(): Set<string> {
  return new Set(readReceiptRegistry().map((entry) => entry.key))
}

function rememberReceiptKeys(receipt?: ReceiptIdentity) {
  const keys = receiptKeys(receipt)
  if (keys.length === 0) return

  const entries = readReceiptRegistry()
  const existing = new Set(entries.map((entry) => entry.key))
  const now = Date.now()

  keys.forEach((key) => {
    if (!existing.has(key)) {
      entries.push({ key, savedAt: now })
      existing.add(key)
    }
  })

  localStorage.setItem(RECEIPT_REGISTRY_KEY, JSON.stringify(entries))
}

function migrateLegacyReceiptReferences(transactions: Transaction[]) {
  const entries = readReceiptRegistry()
  const existing = new Set(entries.map((entry) => entry.key))
  const now = Date.now()

  transactions.forEach((transaction) => {
    const transactionTime = new Date(transaction.createdAt).getTime()
    const savedAt = Number.isNaN(transactionTime) ? now : transactionTime

    receiptKeys(transaction.receipt).forEach((key) => {
      if (!existing.has(key)) {
        entries.push({ key, savedAt })
        existing.add(key)
      }
    })
  })

  localStorage.setItem(RECEIPT_REGISTRY_KEY, JSON.stringify(entries))
}

// Points are derived from the current ledger, so deleting or correcting entries
// cannot leave behind rewards for transactions that no longer qualify.
function calculateRewards(transactions: Transaction[]) {
  const months: Record<string, { income: number; savings: number }> = {}
  const expenseDays = new Set<string>()
  for (const transaction of transactions) {
    const date = new Date(transaction.createdAt)
    if (Number.isNaN(date.getTime())) continue
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    const cents = Math.round(transaction.amount * 100)
    months[month] ||= { income: 0, savings: 0 }
    if (transaction.type === "income") months[month].income += cents
    if (transaction.type === "savings") months[month].savings += cents
    if (transaction.type === "expense") expenseDays.add(`${month}-${date.getDate()}`)
  }
  const qualifyingMonths = Object.entries(months)
    .filter(([, values]) => values.income > 0 && values.savings * 5 >= values.income)
    .map(([month]) => month)
  const expensePoints = expenseDays.size * 5
  const savingsPoints = qualifyingMonths.length * 50
  return { expensePoints, savingsPoints, total: expensePoints + savingsPoints, qualifyingMonths }
}

type ReceiptIdentity = {
  reference?: string
  issuer?: string
  imageHash?: string
  receiptDate?: string
  recipient?: string
}

function readReceiptIdentity(text: string): ReceiptIdentity {
  const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const referenceMatch = text.match(/(?:^|\n)\s*(?:(?:reference|ref\.?)(?:\s*(?:number|no\.?|id))?|(?:receipt|transaction|transfer|invoice)\s*(?:number|no\.?|id|#))\s*[:#-]?\s*([A-Z0-9][A-Z0-9 /-]{2,60})(?:\n|$)/i)
  const reference = referenceMatch ? normalize(referenceMatch[1].trim()) : ""
  const issuer = /bank of maldives|\bbml\b/i.test(text) ? "BML" : /maldives islamic bank|\bmib\b/i.test(text) ? "MIB" : undefined
  const receiptDate = text.match(/(?:transaction date|date)\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2})/i)?.[1]
  const recipient = text.match(/(?:^|\n)\s*(?:to|recipient|beneficiary)\s*:?\s*([^\n]+)/i)?.[1]
  return { reference: reference || undefined, issuer, receiptDate, recipient: recipient ? normalize(recipient) : undefined }
}

function receiptDuplicate(receipt: ReceiptIdentity, amount: number, transactions: Transaction[]) {
  const possible = !receipt.reference && transactions.find(item =>
    item.receipt && receipt.receiptDate && receipt.recipient &&
    item.receipt.receiptDate === receipt.receiptDate && item.receipt.recipient === receipt.recipient &&
    Math.round(item.amount * 100) === Math.round(amount * 100))
  return { possible }
}

type SlipSuggestion = {
  amount: string
  category: string
  expenseGroup: ExpenseGroup
  note: string
}

function suggestSlip(text: string, currency: string): SlipSuggestion {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  // Only use monetary fields, never arbitrary numbers, dates or account IDs.
  const money = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?"
  const currencyToken = "(?:MVR|ThRF|rufiyaa|Rf\\.?|USD|US\\$|EUR|GBP|INR|LKR|AED|SGD|AUD|CAD|BDT|CHF|CNY|JPY|MYR|NPR|PKR|QAR|SAR|THB|\\$|€|£)"
  const candidates: { amount: number; rank: number; unit: string }[] = []
  const parseField = (value: string, rank: number) => {
    const match = value.match(new RegExp(`^(?:(${currencyToken})\\s*)?(${money})(?:\\s*(${currencyToken}))?\\s*$`, "i"))
    if (!match) return
    const amount = Number(match[2].replace(/,/g, ""))
    if (Number.isFinite(amount) && amount > 0) {
      candidates.push({ amount, rank, unit: (match[1] || match[3] || "").toUpperCase() })
    }
  }
  lines.forEach((line, index) => {
    const label = line.match(/^(grand total|total amount|amount paid|transfer amount|transaction amount|amount|total|debit|credit|balance due)\b\s*[:=\-]?\s*(.*)$/i)
    if (label) {
      const rank = /grand total|total amount|amount paid|transfer amount|transaction amount/i.test(label[1]) ? 3 : 2
      if (label[2]) parseField(label[2], rank)
      else {
        parseField(lines[index + 1] || "", rank)
        if (new RegExp(`^${currencyToken}$`, "i").test(lines[index + 1] || "")) {
          parseField(`${lines[index + 1]} ${lines[index + 2] || ""}`, rank)
        }
      }
    }
    if (new RegExp(currencyToken, "i").test(line)) parseField(line, 1)
    if (new RegExp(`^${currencyToken}$`, "i").test(line)) {
      parseField(`${lines[index - 1] || ""} ${line}`, 1)
      parseField(`${line} ${lines[index + 1] || ""}`, 1)
    }
  })
  const rank = Math.max(0, ...candidates.map(item => item.rank))
  const best = candidates.filter(item => item.rank === rank)
  const amounts = [...new Set(best.map(item => item.amount))]
  const normalizeUnit = (unit: string) => /^(?:RF\.?|THRF|RUFIYAA)$/.test(unit) ? "MVR" : unit === "US$" ? "USD" : unit === "€" ? "EUR" : unit === "£" ? "GBP" : unit
  const mismatch = best.some(item => item.unit && (item.unit === "$" ? true : normalizeUnit(item.unit) !== currency.toUpperCase()))
  const amount = amounts.length === 1 && !mismatch ? amounts[0].toFixed(2) : ""
  const rules: [RegExp, string, ExpenseGroup][] = [
    [/\b(stelco|electricity|electric bill)\b/i, "Electricity", "monthly"],
    [/\b(mwsc|water bill)\b/i, "Water", "monthly"],
    [/\b(rent|rental payment)\b/i, "Rent", "monthly"],
    [/\b(internet|broadband|fibre|fiber)\b/i, "Internet", "monthly"],
    [/\b(netflix|spotify|subscription|youtube premium)\b/i, "Subscriptions", "monthly"],
    [/\b(coffee|café|cafe|espresso|latte|cappuccino)\b/i, "Coffee / Café", "daily"],
    [/\b(grocery|groceries|supermarket)\b/i, "Groceries", "daily"],
    [/\b(restaurant|pizza|burger|takeaway)\b/i, "Food / Restaurants", "daily"],
    [/\b(shopping|clothing|shoes|boutique)\b/i, "Shopping", "daily"],
    [/\b(taxi|bus fare|ferry fare|transport)\b/i, "Transport", "daily"],
  ]
  const rule = rules.find(([pattern]) => pattern.test(text))
  const smallDaily = currency.toUpperCase() === "MVR" && amount !== "" && Number(amount) < 150 && !rule
  const note = [
    amount ? "Amount filled from the slip. Please check it before saving." : mismatch ? "The slip currency differs or is ambiguous. Enter the amount in your selected currency; no conversion is performed." : amounts.length > 1 ? "Conflicting amounts found. Enter the correct total." : "No clear total found. Enter the amount shown on the original slip.",
    rule ? "Category is a suggestion based on the slip text." : smallDaily ? "Under MVR 150: suggested as Daily Expense. Tap a category, or select Own-account transfer if appropriate." : "Daily Expense is the default. The purpose is unclear: choose Coffee, Shopping, another category, or change the transaction type. A transfer may be between your own accounts.",
  ].join(" ")
  return { amount, category: rule?.[1] || "Other", expenseGroup: rule?.[2] || "daily", note }
}

/* Upload starts OCR. Saving still requires an explicit user action. */
function ScanSlipModal({ onClose, onAdd, currency }: {
  onClose: () => void
  onAdd: (transaction: Transaction) => boolean | void
  currency: string
}) {
  const [receipt, setReceipt] = useState<ReceiptIdentity>({})
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState("")
  const [text, setText] = useState("")
  const [error, setError] = useState("")
  const [scanning, setScanning] = useState(false)
  const [status, setStatus] = useState("")
  const [review, setReview] = useState(false)
  const workerRef = useRef<Awaited<ReturnType<typeof createWorker>> | null>(null)
  const runRef = useRef(0)
  const busyRef = useRef(false)

  useEffect(() => {
    if (!file) {
      setPreview("")
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => () => {
    runRef.current += 1
    const worker = workerRef.current
    workerRef.current = null
    if (worker) void worker.terminate().catch(() => {})
  }, [])

  async function scan(selected: File) {
    if (busyRef.current) return
    busyRef.current = true
    const run = ++runRef.current
    setScanning(true)
    setError("")
    setText("")
    setReceipt({})
    setStatus("Loading scanner…")
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null
    try {
      const digest = await crypto.subtle.digest("SHA-256", await selected.arrayBuffer())
      const imageHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
      if (runRef.current !== run) return
      setReceipt({ imageHash })
      worker = await createWorker("eng", 1, {
        logger: (message) => {
          if (runRef.current === run) {
            setStatus(`${message.status} ${Math.round(message.progress * 100)}%`)
          }
        },
      })
      if (runRef.current !== run) return
      workerRef.current = worker
      const result = await worker.recognize(selected)
      if (runRef.current !== run) return
      const recognized = result.data.text.trim()
      setText(recognized)
      setReceipt({ ...readReceiptIdentity(recognized), imageHash })
      if (recognized) setReview(true)
      if (!recognized) setError("No text found. Try a clearer image, or enter the transaction manually.")
    } catch {
      if (runRef.current === run) {
        setError("Scanning failed. Check your internet connection and try a clear PNG or JPG image. You can also enter the transaction manually.")
      }
    } finally {
      if (workerRef.current === worker) workerRef.current = null
      if (worker) await worker.terminate().catch(() => {})
      if (runRef.current === run) {
        busyRef.current = false
        setScanning(false)
        setStatus("")
      }
    }
  }

  if (review) {
    return <AddTransactionModal
      onClose={onClose}
      onAdd={onAdd}
      currency={currency}
      scanText={text}
      scanPreview={preview}
      receipt={receipt}
    />
  }

  return (
    <Modal onClose={onClose}>
      <PageHeader title="Scan Slip" subtitle="Choose a slip. We’ll fill the amount automatically." />
      <div className="scan-box">
        <Upload size={34} />
        <label className="field-label" htmlFor="slip-file">Receipt or bank-slip image</label>
        <input id="slip-file" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" disabled={scanning}
          onChange={(event) => {
            const selected = event.target.files?.[0]
            if (!selected) return
            setFile(null)
            setReceipt({})
            setText("")
            setError("")
            if (!["image/png", "image/jpeg", "image/webp", "image/bmp"].includes(selected.type)) {
              setError("Choose a PNG, JPG, WebP or BMP image. For a PDF, upload a screenshot of the page.")
              event.target.value = ""
              return
            }
            if (selected.size > 15 * 1024 * 1024) {
              setError("Please choose an image smaller than 15 MB.")
              event.target.value = ""
              return
            }
            setFile(selected)
            void scan(selected)
          }} />
        <p>For PDFs, upload a screenshot. Internet is needed to load the scanner. English printed text is supported.</p>
      </div>
      {preview && <img src={preview} alt="Selected receipt" style={{ width: "100%", maxHeight: 300, objectFit: "contain", marginTop: 16 }} />}
      {error && <p role="alert">{error}</p>}
      <p role="status" aria-live="polite">{status}</p>
      {error && file && <button className="secondary-button" disabled={scanning} onClick={() => void scan(file)}>Retry scan</button>}
      {!scanning && <button className="secondary-button" style={{ marginTop: 12 }} onClick={() => setReview(true)}>Enter manually</button>}
      <p className="small-muted">Nothing is saved until you confirm the transaction. Only the receipt reference number is kept for duplicate checks. The original image, OCR text, image fingerprint and other slip details are not archived.</p>
    </Modal>
  )
}

/* =========================================================
   ADD TRANSACTION MODAL
========================================================= */

function AddTransactionModal({
  onClose,
  onAdd,
  currency,
  scanText,
  scanPreview,
  receipt,
}: {
  onClose: () => void
  onAdd: (transaction: Transaction) => boolean | void
  currency: string
  scanText?: string
  scanPreview?: string
  receipt?: ReceiptIdentity
}) {
  const [showMore, setShowMore] = useState(false)
  const submitted = useRef(false)
  const [reference, setReference] = useState(receipt?.reference || "")
  const [suggestion] = useState(() => scanText ? suggestSlip(scanText, currency) : null)

  const [type, setType] =
    useState<TransactionType>("expense")

  const [expenseGroup, setExpenseGroup] =
    useState<ExpenseGroup>(suggestion?.expenseGroup || "daily")

  const [category, setCategory] = useState(
    suggestion?.category || dailyExpenseCategories[0]
  )

  const [customCategory, setCustomCategory] =
    useState("")

  const [amount, setAmount] = useState(suggestion?.amount || "")

  const categories = useMemo(() => {
    if (type === "transfer") return ["Own-account transfer"]

    if (type === "income") {
      return incomeCategories
    }

    if (type === "savings") {
      return savingsCategories
    }

    return expenseGroup === "daily"
      ? dailyExpenseCategories
      : monthlyExpenseCategories
  }, [type, expenseGroup])

  useEffect(() => {
    setCategory(current => categories.includes(current) ? current : categories[0])
    setCustomCategory("")
  }, [categories])

  const isOther =
    category === "Other" ||
    category === "Other Monthly Expense" ||
    category === "Other Income" ||
    category === "Other Goal"

  function submit() {
    if (submitted.current) return
    const numericAmount = roundMoney(Number(amount))

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      alert(
        "Please enter a valid amount greater than 0."
      )
      return
    }

    const finalCategory =
      isOther && customCategory.trim()
        ? customCategory.trim()
        : category

    const now = new Date()

    if (scanText !== undefined && !receiptKeys({reference}).length) {
      alert("Enter the receipt/reference number so duplicate protection can work. If the slip has no reference, cancel and record it with Add Transaction instead.")
      return
    }
    submitted.current = true
    const saved = onAdd({
      receipt: reference.trim() ? { reference: reference.trim() } : undefined,
      id: createId(),
      description: finalCategory,
      amount:
        Math.round(numericAmount * 100) /
        100,
      type,
      category: finalCategory,
      expenseGroup:
        type === "expense"
          ? expenseGroup
          : undefined,
      date: now.toLocaleString(),
      createdAt: now.toISOString(),
    })
    if (saved === false) submitted.current = false
  }

  const quickCategories = type === "expense"
    ? expenseGroup === "daily"
      ? ["Coffee / Café", "Groceries", "Food / Restaurants", "Shopping", "Transport"]
      : ["Rent", "Electricity", "Water", "Internet", "Subscriptions"]
    : categories
  const visibleCategories = showMore ? categories : [...new Set([...quickCategories, category])]
  const labels: Record<string, string> = {
    "Coffee / Café": "☕ Coffee", Groceries: "🛒 Groceries",
    "Food / Restaurants": "🍽️ Food", Shopping: "🛍️ Shopping", Transport: "🚕 Transport",
  }

  return (
    <Modal onClose={onClose}>
      <PageHeader title={scanText !== undefined ? "Save your slip" : "Add Transaction"}
        subtitle="Choose a category, then save." />
      <label className="field-label" htmlFor="receipt-reference">Receipt/reference number {scanText === undefined ? "(optional)" : "(required)"}</label>
      <input id="receipt-reference" className="input" value={reference} onChange={event => setReference(event.target.value)} placeholder="Check against the original slip" />
      {receipt?.issuer && <p>Bank: {receipt.issuer}</p>}
      {receipt?.recipient && <p>Recipient/biller: {receipt.recipient}</p>}
      <label className="field-label" htmlFor="transaction-amount">Amount ({currency})</label>
      <input id="transaction-amount" className="input" type="number" min="0.01" step="0.01"
        value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" />
      {scanText !== undefined && <p className="small-muted">{suggestion?.note || "Enter the amount and choose a category."}</p>}
      <label className="field-label">Transaction type</label>
      <div className="quick-category-grid">
        {(["expense", "income", "savings", "transfer"] as TransactionType[]).map(item => (
          <button key={item} aria-pressed={type === item} className={type === item ? "choice-button active" : "choice-button"}
            onClick={() => { setType(item); setShowMore(false) }}>
            {item === "transfer" ? "Own-account transfer" : item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      {type === "transfer" && <p className="small-muted">Saved in History without changing income, spending, or savings totals.</p>}
      {type === "expense" && <>
        <label className="field-label">Expense type</label>
        <div className="two-buttons">
          {(["daily", "monthly"] as ExpenseGroup[]).map(group => (
            <button key={group} aria-pressed={expenseGroup === group}
              className={expenseGroup === group ? "choice-button active" : "choice-button"}
              onClick={() => { setExpenseGroup(group); setShowMore(false) }}>
              {group === "daily" ? "Daily Expense" : "Monthly Expense"}
            </button>
          ))}
        </div>
      </>}
      <label className="field-label">Category</label>
      <div className="quick-category-grid">
        {visibleCategories.map(item => <button key={item} aria-pressed={category === item}
          className={category === item ? "choice-button active" : "choice-button"}
          onClick={() => setCategory(item)}>{labels[item] || item}</button>)}
        {categories.some(item => !quickCategories.includes(item)) &&
          <button className="choice-button" aria-expanded={showMore} onClick={() => setShowMore(!showMore)}>{showMore ? "Fewer categories" : "More categories"}</button>}
      </div>
      {isOther && <>
        <label className="field-label" htmlFor="custom-category">Description (optional)</label>
        <input id="custom-category" className="input" value={customCategory}
          onChange={event => setCustomCategory(event.target.value)} placeholder="What was it for?" />
      </>}
      <button className="primary-button full" onClick={submit}>Save transaction</button>
      {(scanPreview || scanText) && <details style={{ marginTop: 16 }}>
        <summary>View original slip and text</summary>
        {scanPreview && <img src={scanPreview} alt="Original slip" style={{ width: "100%", maxHeight: 300, objectFit: "contain" }} />}
        {scanText && <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{scanText}</pre>}
      </details>}
    </Modal>
  )
}

/* =========================================================
   TRANSACTION LIST
========================================================= */

function TransactionList({
  transactions,
  currency,
  onDelete,
}: {
  transactions: Transaction[]
  currency: string
  onDelete: (id: string) => void
}) {
  return (
    <div className="transaction-list">
      {transactions.map((transaction) => (
        <div
          className="transaction-row"
          key={transaction.id}
        >
          <div className="transaction-main">
            <div
              className={`transaction-icon ${transaction.type}`}
            >
              {transaction.type === "transfer" && <Wallet size={18} />}
              {transaction.type ===
                "income" && (
                <TrendingUp size={18} />
              )}

              {transaction.type ===
                "expense" && (
                <ReceiptText size={18} />
              )}

              {transaction.type ===
                "savings" && (
                <PiggyBank size={18} />
              )}
            </div>

            <div>
              <strong>
                {transaction.category}
              </strong>

              <p>
                {transaction.type.toUpperCase()}

                {transaction.expenseGroup
                  ? ` • ${transaction.expenseGroup.toUpperCase()}`
                  : ""}

                {" • "}

                {new Date(
                  transaction.createdAt
                ).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="transaction-right">
            <strong>
              {formatMoney(
                transaction.amount,
                currency
              )}
            </strong>

            <button
              className="icon-button"
              onClick={() =>
                onDelete(transaction.id)
              }
              aria-label="Delete"
            >
              <Trash2 size={17} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/* =========================================================
   GOALS
========================================================= */

function GoalsPage({
  goals,
  currency,
  onChange,
  onAddSavings,
}: {
  goals: Goal[]
  currency: string
  onChange: (goals: Goal[]) => boolean
  onAddSavings: (
    goalId: string,
    goalName: string,
    amount: number
  ) => boolean
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [target, setTarget] =
    useState("")
  const [targetDate, setTargetDate] =
    useState("")
  const [contributions, setContributions] =
    useState<Record<string, string>>({})

  function addGoal() {
    const numericTarget = Number(target)

    if (
      !name.trim() ||
      !Number.isFinite(numericTarget) ||
      numericTarget <= 0
    ) {
      alert(
        "Enter a goal name and valid target."
      )
      return
    }

    if (targetDate) {
      const deadline = new Date(`${targetDate}T23:59:59`)
      if (Number.isNaN(deadline.getTime()) || deadline.getTime() < Date.now()) {
        alert("Choose a future target date, or leave it blank.")
        return
      }
    }

    const existing = goals.find(goal => goal.id === editing)
    const rounded = roundMoney(numericTarget)
    if (rounded < 0.01 || (existing && rounded < existing.current)) {
      alert("The target must be at least 0.01 and cannot be less than the amount already saved.")
      return
    }
    const goal: Goal = { id: existing?.id || createId(), name: name.trim(), target: rounded,
      current: existing?.current || 0, openingCurrent: existing?.openingCurrent ?? 0,
      createdAt: existing?.createdAt || new Date().toISOString(), targetDate: targetDate || undefined }
    if (!onChange(editing ? goals.map(item => item.id === editing ? goal : item) : [goal, ...goals])) return
    setEditing(null)

    setName("")
    setTarget("")
    setTargetDate("")
  }

  function contribute(goal: Goal) {
    const entered = contributions[goal.id]?.trim() || ""
    const amount = Number(entered)

    if (
      !entered ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      alert("Enter a valid savings amount greater than 0.")
      return
    }

    const remaining = Math.max(0, goal.target - goal.current)

    if (remaining <= 0) {
      alert("This savings goal is already complete.")
      return
    }

    if (amount > remaining) {
      alert(
        `Only ${formatMoney(remaining, currency)} remains for this goal.`
      )
      return
    }

    const roundedAmount = Math.round(amount * 100) / 100

    if (!onAddSavings(goal.id, goal.name, roundedAmount)) return
    setContributions((previous) => ({
      ...previous,
      [goal.id]: "",
    }))
  }

  return (
    <>
      <PageHeader
        title="Savings Goals"
        subtitle="Turn your future plans into progress"
      />

      <Card>
        <h2>{editing ? "Edit Goal" : "Create Goal"}</h2>

        <div className="form-grid">
          <input
            className="input"
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
            placeholder="Example: New Laptop"
          />

          <input
            className="input"
            type="number"
            value={target}
            onChange={(event) =>
              setTarget(event.target.value)
            }
            placeholder="Target amount"
          />

          <input
            className="input"
            type="date"
            value={targetDate}
            min={localDateKey(new Date())}
            onChange={(event) =>
              setTargetDate(event.target.value)
            }
            aria-label="Target date"
          />

          <button
            className="primary-button"
            onClick={addGoal}
          >
            <Plus size={17} />
            {editing ? "Save Goal" : "Create Goal"}
          </button>
          {editing && <button className="secondary-button" onClick={() => { setEditing(null); setName(""); setTarget(""); setTargetDate("") }}>Cancel Edit</button>}
        </div>
      </Card>

      {goals.length === 0 ? (
        <Card>
          <EmptyState
            text="You don't have any savings goals yet."
          />
        </Card>
      ) : (
        <div className="goal-grid">
          {goals.map((goal) => {
            const progress = percentage(
              goal.current,
              goal.target
            )
            const remaining = Math.max(0, goal.target - goal.current)
            const deadline = goal.targetDate
              ? new Date(`${goal.targetDate}T23:59:59`)
              : null
            const monthsLeft =
              deadline && !Number.isNaN(deadline.getTime())
                ? Math.max(
                    1,
                    Math.ceil(
                      (deadline.getTime() - Date.now()) /
                        (30.4375 * 24 * 60 * 60 * 1000)
                    )
                  )
                : null
            const recommendedMonthly =
              monthsLeft && remaining > 0
                ? remaining / monthsLeft
                : 0

            return (
              <Card key={goal.id}>
                <div className="section-title-row">
                  <div>
                    <h2>{goal.name}</h2>

                    <p>
                      {formatMoney(
                        goal.current,
                        currency
                      )}{" "}
                      of{" "}
                      {formatMoney(
                        goal.target,
                        currency
                      )}
                    </p>
                  </div>

                  <div className="quick-actions">
                    <button className="secondary-button" onClick={() => { setEditing(goal.id); setName(goal.name); setTarget(String(goal.target)); setTargetDate(goal.targetDate || "") }}>Edit</button>
                    <button className="icon-button" aria-label={`Delete ${goal.name}`} onClick={() => {
                      if (confirm("Delete this goal? Its savings transactions will remain in History and Total Savings.")) {
                        if (onChange(goals.filter(item => item.id !== goal.id)) && editing === goal.id) { setEditing(null); setName(""); setTarget(""); setTargetDate("") }
                      }
                    }}><Trash2 size={17} /></button>
                  </div>
                </div>

                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${progress}%`,
                    }}
                  />
                </div>

                <p className="small-muted">
                  {progress.toFixed(1)}% complete
                  {goal.targetDate ? ` · Target ${goal.targetDate}` : ""}
                </p>

                <div className="summary-list">
                  <div>
                    <span>Remaining</span>
                    <strong>{formatMoney(remaining, currency)}</strong>
                  </div>
                  {monthsLeft && remaining > 0 && (
                    <div>
                      <span>Suggested per month</span>
                      <strong>{formatMoney(recommendedMonthly, currency)}</strong>
                    </div>
                  )}
                </div>

                {remaining > 0 ? (
                  <div className="goal-contribution-row">
                    <input
                      className="input"
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      value={contributions[goal.id] || ""}
                      onChange={(event) =>
                        setContributions((previous) => ({
                          ...previous,
                          [goal.id]: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          contribute(goal)
                        }
                      }}
                      placeholder="Amount to add"
                      aria-label={`Amount to add to ${goal.name}`}
                    />

                    <button
                      className="secondary-button"
                      onClick={() =>
                        contribute(goal)
                      }
                    >
                      <PiggyBank size={17} />
                      Add Funds
                    </button>
                  </div>
                ) : (
                  <span className="achievement-earned">
                    <CheckCircle2 size={16} />
                    Goal reached
                  </span>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

/* =========================================================
   BUDGETS
========================================================= */

function BudgetsPage({
  budgets,
  categoryTotals,
  currency,
  onChange,
  dailyBudget,
  todaysDailyExpenses,
  onDailyBudgetChange,
  embedded = false,
}: {
  budgets: Budget[]
  categoryTotals: {
    category: string
    amount: number
  }[]
  currency: string
  onChange: (budgets: Budget[]) => boolean
  dailyBudget: number
  todaysDailyExpenses: number
  onDailyBudgetChange: (amount: number) => boolean
  embedded?: boolean
}) {
  const [category, setCategory] =
    useState(allExpenseCategories[0])

  const [limit, setLimit] =
    useState("")

  const [dailyLimit, setDailyLimit] =
    useState(dailyBudget > 0 ? String(dailyBudget) : "")

  function saveDailyBudget() {
    const amount = roundMoney(Number(dailyLimit))

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Enter a valid daily spending limit.")
      return
    }

    onDailyBudgetChange(Math.round(amount * 100) / 100)
  }

  function saveBudget() {
    const amount = roundMoney(Number(limit))

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      alert(
        "Enter a valid monthly budget."
      )
      return
    }

    const existing = budgets.find(
      (item) =>
        item.category === category
    )

    if (existing) {
      onChange(
        budgets.map((item) =>
          item.category === category
            ? {
                ...item,
                limit: amount,
              }
            : item
        )
      )
    } else {
      onChange([
        ...budgets,
        {
          id: createId(),
          category,
          limit: amount,
        },
      ])
    }

    setLimit("")
  }

  return (
    <>
      {!embedded && (
        <PageHeader
          title="Budgets"
          subtitle="Set limits and control monthly spending"
        />
      )}

      <Card>
        <h2>Daily Spending Budget</h2>
        <p>Set one flexible-spending limit for each day. This includes Daily Expenses; monthly bills are counted in monthly budgets.</p>

        <div className="form-grid">
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={dailyLimit}
            onChange={(event) => setDailyLimit(event.target.value)}
            placeholder="Example: 100"
          />

          <button className="primary-button" onClick={saveDailyBudget}>
            Save Daily Budget
          </button>

          {dailyBudget > 0 && (
            <button
              className="secondary-button"
              onClick={() => {
                setDailyLimit("")
                onDailyBudgetChange(0)
              }}
            >
              Remove Daily Budget
            </button>
          )}
        </div>

        {dailyBudget > 0 && (
          <>
            <div className="summary-list">
              <div>
                <span>Spent today</span>
                <strong>{formatMoney(todaysDailyExpenses, currency)}</strong>
              </div>
              <div>
                <span>Daily limit</span>
                <strong>{formatMoney(dailyBudget, currency)}</strong>
              </div>
            </div>

            <div className="progress-track">
              <div
                className={
                  usagePercentage(todaysDailyExpenses, dailyBudget) >= 100
                    ? "progress-fill over"
                    : "progress-fill"
                }
                style={{
                  width: `${Math.min(
                    usagePercentage(todaysDailyExpenses, dailyBudget),
                    100
                  )}%`,
                }}
              />
            </div>

            <p className="small-muted">
              {usagePercentage(todaysDailyExpenses, dailyBudget).toFixed(0)}% used today
            </p>
          </>
        )}
      </Card>

      <Card>
        <h2>Set Monthly Budget</h2>

        <div className="form-grid">
          <select
            className="input"
            value={category}
            onChange={(event) =>
              setCategory(
                event.target.value
              )
            }
          >
            {[...new Set([...allExpenseCategories, ...categoryTotals.map(item => item.category)])].map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              )
            )}
          </select>

          <input
            className="input"
            type="number"
            value={limit}
            onChange={(event) =>
              setLimit(event.target.value)
            }
            placeholder="Monthly limit"
          />

          <button
            className="primary-button"
            onClick={saveBudget}
          >
            Save Budget
          </button>
        </div>
      </Card>

      {budgets.length === 0 ? (
        <Card>
          <EmptyState
            text="No budgets created yet."
          />
        </Card>
      ) : (
        <div className="goal-grid">
          {budgets.map((budget) => {
            const spent =
              categoryTotals.find(
                (item) =>
                  item.category ===
                  budget.category
              )?.amount || 0

            const used = usagePercentage(
              spent,
              budget.limit
            )

            return (
              <Card key={budget.id}>
                <div className="section-title-row">
                  <div>
                    <h2>
                      {budget.category}
                    </h2>

                    <p>
                      {formatMoney(
                        spent,
                        currency
                      )}{" "}
                      spent of{" "}
                      {formatMoney(
                        budget.limit,
                        currency
                      )}
                    </p>
                  </div>

                  <button
                    className="icon-button"
                    onClick={() =>
                      onChange(
                        budgets.filter(
                          (item) =>
                            item.id !==
                            budget.id
                        )
                      )
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>

                <div className="progress-track">
                  <div
                    className={
                      used >= 100
                        ? "progress-fill over"
                        : "progress-fill"
                    }
                    style={{
                      width: `${Math.min(used, 100)}%`,
                    }}
                  />
                </div>

                <p className="small-muted">
                  {used.toFixed(1)}% used
                  {used >= 100
                    ? " · Budget limit reached or exceeded"
                    : used >= 80
                      ? " · Warning: nearing limit"
                      : ""}
                </p>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

/* =========================================================
   EMPTY STATE
========================================================= */

function EmptyState({
  text,
}: {
  text: string
}) {
  return (
    <div className="empty-state">
      <Wallet size={28} />
      <p>{text}</p>
    </div>
  )
}

/* =========================================================
   CSS
========================================================= */

const APP_CSS = `
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #f6f7f9;
  color: #20262e;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

button,
input,
select {
  font: inherit;
}

button {
  -webkit-tap-highlight-color: transparent;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.app-shell {
  min-height: 100vh;
  background: #f6f7f9;
}

.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: 250px;
  background: #ffffff;
  border-right: 1px solid #e5e8ec;
  display: flex;
  flex-direction: column;
  z-index: 30;
}

.brand {
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 11px;
  border-bottom: 1px solid #edf0f2;
}

.brand-logo {
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: #28333d;
  color: white;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.brand-logo.small {
  width: 34px;
  height: 34px;
  border-radius: 10px;
}

.brand strong {
  display: block;
  font-size: 16px;
}

.brand span {
  display: block;
  font-size: 12px;
  color: #7c8792;
  margin-top: 2px;
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.nav-button {
  width: 100%;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  border-radius: 11px;
  cursor: pointer;
  color: #64707c;
  margin-bottom: 3px;
  font-weight: 600;
  text-align: left;
}

.nav-button:hover {
  background: #f4f5f6;
  color: #28333d;
}

.nav-button.active {
  background: #eceff1;
  color: #202932;
}

.sidebar-actions {
  border-top: 1px solid #edf0f2;
  padding: 12px;
  display: grid;
  gap: 8px;
}

.main-area {
  margin-left: 250px;
  min-height: 100vh;
}

.content {
  width: min(1100px, calc(100% - 40px));
  margin: auto;
  padding: 34px 0 90px;
}

.mobile-header,
.mobile-nav {
  display: none;
}

.page-header {
  margin-bottom: 22px;
}

.page-header h1 {
  margin: 0;
  font-size: 27px;
  letter-spacing: -0.6px;
}

.page-header p {
  margin: 6px 0 0;
  color: #7a858f;
  font-size: 14px;
}

.wq-card {
  background: #ffffff;
  border: 1px solid #e4e8eb;
  border-radius: 17px;
  padding: 20px;
  margin-bottom: 18px;
  box-shadow:
    0 1px 2px rgba(0,0,0,0.02);
}

.wq-card h2 {
  margin: 0 0 6px;
  font-size: 18px;
}

.wq-card h3 {
  margin: 12px 0 6px;
}

.wq-card p {
  color: #74808a;
}

.stats-grid {
  display: grid;
  grid-template-columns:
    repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.stat-label {
  display: block;
  font-size: 13px;
  color: #7b8791;
  margin-bottom: 10px;
}

.stat-value {
  display: block;
  font-size: 22px;
  letter-spacing: -0.5px;
}

.stat-value.small {
  font-size: 17px;
}

.quick-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.primary-button,
.secondary-button,
.danger-button,
.text-button {
  border: 0;
  border-radius: 10px;
  padding: 11px 15px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-weight: 650;
}

.primary-button {
  background: #28333d;
  color: white;
}

.primary-button:hover {
  background: #182028;
}

.primary-button.full {
  width: 100%;
  margin-top: 20px;
  padding: 14px;
}

.secondary-button {
  background: #eef0f2;
  color: #303a43;
}

.secondary-button:hover {
  background: #e2e6e9;
}

.danger-button {
  background: #fff1f1;
  color: #a63f3f;
  margin-top: 12px;
}

.text-button {
  background: transparent;
  color: #4f5d69;
  padding: 6px 8px;
}

.section-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 15px;
  margin-bottom: 14px;
}

.section-title-row h2 {
  margin: 0;
}

.section-title-row p {
  margin: 4px 0 0;
  font-size: 13px;
}

.split-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.mini-stat {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #f7f8f9;
  padding: 15px;
  border-radius: 13px;
}

.mini-icon {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: #e9ecef;
  display: grid;
  place-items: center;
}

.mini-stat span {
  display: block;
  color: #7b8791;
  font-size: 12px;
}

.mini-stat strong {
  display: block;
  margin-top: 4px;
}

.summary-list {
  display: grid;
}

.summary-list > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #edf0f2;
}

.summary-list > div:last-child {
  border-bottom: 0;
}

.summary-list span {
  color: #68747e;
}

.transaction-list {
  display: grid;
}

.transaction-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid #edf0f2;
}

.transaction-row:last-child {
  border-bottom: 0;
}

.transaction-main {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.transaction-icon {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.transaction-icon.transfer {
  background: #eef0f2;
  color: #58646e;
}

.quick-category-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.transaction-icon.income {
  background: #eaf5ee;
  color: #477a5b;
}

.transaction-icon.expense {
  background: #f8eded;
  color: #955656;
}

.transaction-icon.savings {
  background: #edf1f7;
  color: #526b8a;
}

.transaction-main strong {
  display: block;
}

.transaction-main p {
  margin: 4px 0 0;
  font-size: 11px;
  color: #87919a;
}

.transaction-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.icon-button {
  border: 1px solid #e1e5e8;
  background: white;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: #7b858e;
}

.icon-button:hover {
  background: #f7f8f9;
  color: #b14f4f;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(20, 27, 33, 0.48);
  display: grid;
  place-items: center;
  padding: 20px;
}

.modal-card {
  position: relative;
  width: min(560px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  background: white;
  border-radius: 20px;
  padding: 25px;
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.18);
}

.modal-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 10px;
  background: #f2f4f5;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.field-label {
  display: block;
  margin: 18px 0 8px;
  font-size: 13px;
  font-weight: 700;
}

.input {
  width: 100%;
  border: 1px solid #d7dce0;
  background: white;
  border-radius: 10px;
  padding: 12px 13px;
  outline: none;
  color: #26313a;
}

.input:focus {
  border-color: #89949d;
  box-shadow:
    0 0 0 3px rgba(90, 105, 117, 0.08);
}

.two-buttons,
.three-buttons {
  display: grid;
  gap: 9px;
}

.two-buttons {
  grid-template-columns: 1fr 1fr;
}

.three-buttons {
  grid-template-columns:
    repeat(3, 1fr);
}

.choice-button {
  border: 1px solid #d9dde1;
  background: white;
  color: #58646e;
  border-radius: 11px;
  padding: 12px;
  font-weight: 650;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.choice-button.active {
  border: 2px solid #28333d;
  background: #f0f2f3;
  color: #202932;
}

.form-grid {
  display: grid;
  grid-template-columns: 2fr 1fr auto;
  gap: 9px;
}

.goal-contribution-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  margin-top: 14px;
}

.goal-contribution-row .secondary-button {
  white-space: nowrap;
}

.goal-grid,
.achievement-grid {
  display: grid;
  grid-template-columns:
    repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.achievement-grid {
  grid-template-columns:
    repeat(3, minmax(0, 1fr));
}

.progress-track {
  width: 100%;
  height: 8px;
  border-radius: 100px;
  background: #e9edef;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #596a78;
  border-radius: inherit;
  transition: width 0.25s ease;
}

.progress-fill.over {
  background: #a55b5b;
}

.small-muted,
.muted {
  color: #7d8891;
  font-size: 13px;
}

.category-list {
  display: grid;
  gap: 17px;
  margin-top: 18px;
}

.category-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 7px;
}

.review-hero {
  display: flex;
  gap: 15px;
  align-items: center;
  padding-bottom: 16px;
}

.review-hero h2 {
  margin: 0;
}

.review-hero p {
  margin: 4px 0 0;
}

.game-level {
  display: flex;
  gap: 16px;
  align-items: center;
}

.level-badge {
  width: 72px;
  height: 72px;
  border-radius: 22px;
  display: grid;
  place-items: center;
  background: #28333d;
  color: white;
  font-size: 28px;
  font-weight: 800;
}

.level-details {
  flex: 1;
}

.level-details span,
.level-details strong,
.level-details small {
  display: block;
}

.level-details strong {
  margin: 3px 0 8px;
  font-size: 20px;
}

.level-details small {
  margin-top: 7px;
  color: #7b8791;
}

.achievement-earned {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #4c795e;
  font-size: 13px;
  font-weight: 700;
}

.report-grid {
  display: grid;
  grid-template-columns:
    repeat(2, 1fr);
}

.report-grid > div {
  padding: 14px;
  border-bottom: 1px solid #edf0f2;
}

.report-grid span {
  display: block;
  color: #7b8791;
  font-size: 12px;
}

.report-grid strong {
  display: block;
  margin-top: 5px;
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.toggle-row p {
  margin: 4px 0 0;
  font-size: 13px;
}

.toggle-row input {
  width: 20px;
  height: 20px;
}

.scan-box {
  border: 2px dashed #d5dade;
  padding: 34px;
  border-radius: 15px;
  text-align: center;
  color: #66727c;
}

.scan-box strong,
.scan-box p {
  display: block;
}

.scan-box strong {
  margin-top: 12px;
}

.scan-box p {
  font-size: 13px;
}

.empty-state {
  padding: 32px;
  display: grid;
  place-items: center;
  text-align: center;
  color: #8b959d;
}

.empty-state p {
  margin: 8px 0 0;
}

/* =========================================================
   RESPONSIVE
========================================================= */

@media (max-width: 900px) {
  .sidebar {
    display: none;
  }

  .main-area {
    margin-left: 0;
  }

  .mobile-header {
    display: flex;
    position: sticky;
    top: 0;
    z-index: 25;
    background: rgba(255,255,255,0.92);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid #e8ebee;
    padding: 10px 15px;
    align-items: center;
    justify-content: space-between;
  }

  .mobile-brand {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .level-pill {
    background: #eef0f2;
    border-radius: 100px;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 700;
  }

  .content {
    width: min(100% - 28px, 760px);
    padding-top: 24px;
    padding-bottom: 90px;
  }

  .mobile-nav {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 67px;
    z-index: 30;
    background: white;
    border-top: 1px solid #e2e6e9;
    overflow-x: auto;
    justify-content: flex-start;
    gap: 12px;
    padding: 0 12px;
    align-items: center;
  }

  .mobile-nav-button {
    border: 0;
    background: transparent;
    color: #8b959d;
    min-width: 58px;
    display: grid;
    justify-items: center;
    gap: 3px;
    cursor: pointer;
  }

  .mobile-nav-button span {
    font-size: 10px;
    font-weight: 650;
  }

  .mobile-nav-button.active {
    color: #28333d;
  }

  .stats-grid {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }

  .achievement-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .content {
    width: calc(100% - 20px);
  }

  .page-header h1 {
    font-size: 23px;
  }

  .stats-grid,
  .split-grid,
  .goal-grid,
  .report-grid {
    grid-template-columns: 1fr;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .goal-contribution-row {
    grid-template-columns: 1fr;
  }


  .three-buttons {
    grid-template-columns:
      repeat(3, 1fr);
  }

  .choice-button {
    padding: 11px 7px;
    font-size: 12px;
  }

  .transaction-row {
    align-items: flex-start;
  }

  .transaction-right {
    flex-direction: column;
    align-items: flex-end;
  }

  .transaction-main p {
    max-width: 190px;
  }

  .modal-card {
    padding: 20px;
  }
}


@media print {
  body,
  .app-shell {
    background: #ffffff !important;
  }

  .sidebar,
  .mobile-header,
  .mobile-nav,
  .no-print,
  .modal-backdrop {
    display: none !important;
  }

  .main-area {
    margin-left: 0 !important;
  }

  .content {
    width: 100% !important;
    padding: 0 !important;
  }

  .wq-card {
    box-shadow: none !important;
    break-inside: avoid;
  }
}

/* Shared Maldivian lagoon theme for all pages and dialogs. */
.lagoon { --sea: #087f80; --ink: #133f49; --quiet: #526e72; background: #f5f5ef; color: var(--ink); font-family: "Avenir Next Rounded Pro", "Nunito", ui-rounded, "Trebuchet MS", system-ui, sans-serif; }
.lagoon .content { width: min(1190px, calc(100% - 64px)); padding-top: 38px; }
.lagoon .sidebar { background: #fcfdf9; border-color: #dde7e1; }
.lagoon .brand { padding: 28px 20px; border-color: #e4ebe5; }
.lagoon .brand-logo { background: #087f80; border-radius: 15px 15px 15px 4px; }

.lagoon .wealthquest-brand-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  border-radius: inherit;
}

.lagoon .brand strong { color: #133f49; letter-spacing: -.5px; font-size: 19px; }
.lagoon .brand span { color: #526e72; }
.lagoon .nav-button { color: #526e72; padding: 13px 14px; margin-bottom: 5px; }
.lagoon .nav-button.active { color: #076b6b; background: #e0f0e9; }
.lagoon .nav-button:hover { background: #eaf3ee; }
.lagoon .primary-button { background: #087f80; color: #fff; border-radius: 12px; min-height: 44px; }
.lagoon .primary-button:hover { background: #066869; }
.lagoon .secondary-button { background: #e3f1ed; color: #076969; min-height: 44px; }
.lagoon .secondary-button:hover { background: #d2e8e0; }
.lagoon .text-button { color: #087475; min-height: 44px; }
.lagoon button:focus-visible, .lagoon input:focus-visible, .lagoon select:focus-visible { outline: 3px solid #087f80; outline-offset: 3px; }
.lagoon .wq-card { border: 1px solid #e1e8e1; border-radius: 20px; padding: 24px; box-shadow: 0 3px 12px #183f4510; }
.lagoon .wq-card h2 { color: #173f47; font-size: 20px; letter-spacing: -.5px; }
.lagoon .wq-card h3 { font-size: 15px; }
.lagoon .wq-card p, .lagoon .small-muted, .lagoon .summary-list span, .lagoon .empty-state { color: #526e72; }
.lagoon-heading { display: flex; justify-content: space-between; gap: 20px; align-items: center; margin-bottom: 26px; }
.lagoon-eyebrow { font-size: 10px; font-weight: 800; letter-spacing: 1.65px; color: #526e72; display: block; margin-bottom: 9px; }
.lagoon-heading h1 { font-size: clamp(27px, 3vw, 38px); letter-spacing: -1.5px; line-height: 1.15; margin: 0; }
.lagoon-heading p { margin: 10px 0 0; color: #526e72; font-size: 14px; }
.lagoon-date { display: flex; align-items: center; gap: 8px; font-size: 12px; white-space: nowrap; border: 1px solid #c8ddd5; border-radius: 30px; padding: 9px 13px; background: #fffdf8d9; color: #315d61; }
.lagoon-hero { background: linear-gradient(115deg, #dff3ed 0%, #d4eee9 58%, #cce8e5 100%); border: 1px solid #bddfd7; border-radius: 24px; position: relative; display: flex; align-items: center; justify-content: space-between; gap: 28px; padding: 24px 28px; margin-bottom: 18px; min-height: 150px; overflow: hidden; color: #104b53; }
.lagoon-hero-compact { isolation: isolate; }
.lagoon-waves { position: absolute; right: 0; bottom: 0; width: 66%; height: 100%; pointer-events: none; z-index: 0; }
.lagoon-hero-copy, .lagoon-hero-actions, .lagoon-hero-side { position: relative; z-index: 1; }
.lagoon-hero .lagoon-eyebrow { color: #326568; }
.lagoon-hero-intro { max-width: 620px; }
.lagoon-hero-intro h1 { margin: 0; font-size: clamp(29px, 3vw, 40px); letter-spacing: -1.45px; line-height: 1.08; color: #123f48; }
.lagoon-hero-intro p { margin: 10px 0 0; font-size: 13px; color: #426b6d; line-height: 1.55; max-width: 520px; }
.lagoon-hero-side { display: flex; flex-direction: column; align-items: flex-end; gap: 14px; flex-shrink: 0; }
.lagoon-hero-actions { display: flex; gap: 10px; flex-shrink: 0; }
.lagoon-hero-actions .primary-button, .lagoon-hero-actions .secondary-button { white-space: nowrap; }
.lagoon-hero-actions .secondary-button { background: #ffffffd9; }
.lagoon .stats-grid { gap: 14px; margin-bottom: 22px; }
.lagoon .stats-grid .wq-card { padding: 20px; margin: 0; min-width: 0; }
.lagoon-stat-top { display: flex; align-items: center; gap: 8px; justify-content: space-between; margin-bottom: 14px; }
.lagoon-stat-top svg { color: #087f80; flex-shrink: 0; }
.lagoon .stat-label { color: #526e72; font-size: 12px; margin: 0; }
.lagoon .stat-value { font-size: clamp(18px, 1.8vw, 25px); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; letter-spacing: -.7px; }
.lagoon .lagoon-stat-note { font-size: 10px; margin: 8px 0 0; line-height: 1.5; }
.lagoon-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.lagoon-columns > .wq-card { min-width: 0; }
.lagoon .section-title-row { align-items: center; }
.lagoon .section-title-row .text-button { font-size: 12px; flex-shrink: 0; }
.lagoon-budget-number { display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; margin: 25px 0 16px; }
.lagoon-budget-number strong { font-size: 28px; letter-spacing: -1px; }
.lagoon-budget-number span { font-size: 12px; color: #526e72; }
.lagoon .progress-track { height: 9px; background: #e6eee8; }
.lagoon .progress-fill { background: #138e89; }
.lagoon .progress-fill.over { background: #b45738; }
.lagoon .lagoon-warning { color: #90421f; font-size: 13px; }
.lagoon-divider { height: 1px; background: #e6ebe4; margin: 25px 0 20px; }
.lagoon .summary-list > div { border-color: #e7ede7; font-size: 13px; }
.lagoon-goals { display: grid; gap: 16px; margin-top: 20px; }
.lagoon-goal-name { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; font-size: 14px; }
.lagoon-goal-name strong { flex: 1; overflow-wrap: anywhere; }
.lagoon-goal-name > span:last-child { color: #087475; font-size: 12px; }
.lagoon-goal-icon { background: #eef3e8; padding: 8px; border-radius: 10px; display: flex; color: #49745d; }
.lagoon-goal p { font-size: 12px; margin: 8px 0 0; }
.lagoon-goal p span { color: #657b7d; }
.lagoon-savings-note { margin-top: 22px; display: flex; align-items: center; gap: 8px; background: #f2f6ee; border-radius: 12px; padding: 12px; font-size: 12px; color: #365e51; }
.lagoon-goal-empty { padding: 24px 8px; text-align: center; color: #168984; }
.lagoon-goal-empty p { font-size: 13px; line-height: 1.7; }
.lagoon-goal-empty .secondary-button { font-size: 12px; }
.lagoon-alert { display: flex; gap: 12px; align-items: center; padding: 16px 20px; margin-bottom: 22px; border: 1px solid #ead7b7; border-radius: 16px; background: #faf1df; color: #775121; }
.lagoon-alert div { flex: 1; }.lagoon-alert strong { font-size: 14px; }.lagoon-alert p { font-size: 12px; margin: 5px 0 0; }
.lagoon .transaction-icon.income { background: #e3f2e8; color: #337455; }
.lagoon .transaction-icon.expense { background: #faf0df; color: #936231; }
.lagoon .transaction-icon.savings { background: #e0f2ef; color: #087f80; }
.lagoon .transaction-main p { color: #526e72; }
.lagoon-footer { display: flex; justify-content: space-between; gap: 16px; color: #526e72; font-size: 12px; margin-top: 22px; }
.lagoon-footer strong { margin-left: 8px; color: #173f47; }
@media (max-width: 1150px) { .lagoon .stats-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (max-width: 900px) {
 .lagoon .content { width: calc(100% - 36px); padding-top: 24px; }
 .lagoon .mobile-header { background: #fcfdf9; }
 .lagoon .mobile-nav { background: #fcfdf9; padding-bottom: env(safe-area-inset-bottom); height: calc(67px + env(safe-area-inset-bottom)); }
 .lagoon .mobile-nav-button { color: #526e72; min-height: 44px; }
 .lagoon .mobile-nav-button.active { color: #076b6b; background: #e0f0e9; border-radius: 10px; }
 .lagoon .content { padding-bottom: calc(100px + env(safe-area-inset-bottom)); }
}
@media (max-width: 620px) {
 .lagoon-heading { display: block; }
 .lagoon-hero { display: block; padding: 22px 20px; min-height: 0; }
 .lagoon-hero-side { align-items: stretch; gap: 12px; margin-top: 18px; }
 .lagoon-date { width: fit-content; }
 .lagoon-hero-actions { display: grid; grid-template-columns: 1fr 1fr; margin-top: 0; }
 .lagoon-hero-actions button { font-size: 12px; padding: 10px; }
 .lagoon-columns { grid-template-columns: minmax(0,1fr); gap: 0; }
 .lagoon .stats-grid { gap: 10px; }.lagoon .stats-grid .wq-card { padding: 16px; }
 .lagoon .wq-card { padding: 20px; }.lagoon-stat-top svg { display: none; }
 .lagoon-footer { flex-direction: column; line-height: 1.7; }.lagoon-alert { flex-wrap: wrap; }
 .lagoon .section-title-row h2 { font-size: 18px; }.lagoon .lagoon-eyebrow { font-size: 9px; letter-spacing: 1.1px; }
}
@media (prefers-reduced-motion: reduce) { .lagoon * { transition: none !important; } }
@media print { .lagoon-hero-actions, .lagoon-hero-link { display: none; }.lagoon .content { width: 100%; } }

/* Complete theme coverage: forms, review, insights, rewards and reports. */
.lagoon .page-header { padding: 24px 26px; margin-bottom: 24px; border-radius: 20px; border: 1px solid #d2e7df; background: linear-gradient(115deg, #e0f1eb, #f8faf3); }
.lagoon .page-header h1 { color: var(--ink); font-size: clamp(25px, 3vw, 34px); letter-spacing: -1px; line-height: 1.2; overflow-wrap: anywhere; }
.lagoon .page-header p { color: var(--quiet); line-height: 1.6; }
.lagoon .muted, .lagoon .level-details small, .lagoon .report-grid span { color: var(--quiet); }
.lagoon .input { background: #fcfdf9; color: var(--ink); border: 1px solid #c5d9d1; border-radius: 12px; min-height: 46px; min-width: 0; }
.lagoon .input::placeholder { color: #627b7a; opacity: 1; }
.lagoon .input:focus { border-color: var(--sea); box-shadow: 0 0 0 3px #087f8017; }
.lagoon .field-label { color: #274f54; }
.lagoon .choice-button { color: #345d60; border-color: #c5d9d1; background: #fcfdf9; min-height: 46px; }
.lagoon .choice-button:hover { background: #edf7f2; border-color: #71aaa2; }
.lagoon .choice-button.active { background: #dff2eb; border: 2px solid var(--sea); color: #075e60; }
.lagoon .icon-button { color: #43686a; border-color: #cddfd7; background: #fcfdf9; width: 44px; height: 44px; flex-shrink: 0; border-radius: 12px; }
.lagoon .icon-button:hover { color: #9b3e2e; background: #fff1e9; border-color: #e7bca9; }
.lagoon .danger-button { color: #953c2a; background: #fbece5; border: 1px solid #edcbbc; min-height: 44px; }
.lagoon .danger-button:hover { background: #f5dbcf; }
.lagoon .modal-backdrop { background: #123e497d; backdrop-filter: blur(4px); }
.lagoon .modal-card { background: #fffefa; color: var(--ink); border: 1px solid #d3e6dc; border-radius: 24px; box-shadow: 0 24px 80px #123e4933; }
.lagoon .modal-card .page-header { padding: 18px; margin: 26px 0 20px; }
.lagoon .modal-card .page-header h1 { font-size: 26px; }
.lagoon .modal-close { width: 44px; height: 44px; background: #e7f2ed; color: #23585b; z-index: 1; }
.lagoon .modal-close:hover { background: #cfe9df; }
.lagoon .scan-box { border-color: #81b9ac; background: #edf7f1; color: #326367; padding: 28px 18px; }
.lagoon input[type="file"] { max-width: 100%; color: #345d60; font-size: 13px; }
.lagoon input[type="file"]::file-selector-button { background: #087f80; color: #fff; border: 0; border-radius: 10px; padding: 12px; margin: 0 10px 8px 0; cursor: pointer; font: inherit; }
.lagoon details { border-top: 1px solid #dce8df; padding-top: 14px; color: #345d60; }
.lagoon summary { cursor: pointer; min-height: 36px; }
.lagoon .scan-box p, .lagoon .modal-card .small-muted { line-height: 1.6; }
.lagoon input[type="checkbox"] { accent-color: var(--sea); }
.lagoon .mini-stat { background: #f1f6ee; border: 1px solid #e1eadc; }
.lagoon .mini-icon { background: #dceee3; color: #287668; }
.lagoon .mini-stat span { color: var(--quiet); }
.lagoon .review-hero { background: #e8f5ef; border: 1px solid #cfe4d8; border-radius: 16px; padding: 22px; margin-bottom: 14px; color: #147d79; }
.lagoon .review-hero > svg { flex-shrink: 0; }
.lagoon .game-level { background: #e7f3ed; padding: 20px; border-radius: 18px; border: 1px solid #d1e6da; }
.lagoon .level-badge { background: #087f80; color: white; border-radius: 22px 22px 22px 6px; flex-shrink: 0; }
.lagoon .level-pill { color: #076b6b; background: #dff0e8; }
.lagoon .achievement-grid .wq-card { background: #fffef9; border-top: 3px solid #83bdb1; }
.lagoon .achievement-earned { color: #256c52; background: #e6f3e8; padding: 7px 10px; border-radius: 9px; }
.lagoon .category-row-top { color: #315a5e; gap: 12px; }
.lagoon .report-grid { gap: 10px; }
.lagoon .report-grid > div { background: #f2f7ef; border: 1px solid #e0eadd; border-radius: 12px; }
.lagoon .report-grid strong, .lagoon .summary-list strong { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.lagoon .transaction-row { border-color: #e2ebe3; }
.lagoon .transaction-icon.transfer { background: #e8f1f3; color: #366877; }
.lagoon .transaction-main strong { overflow-wrap: anywhere; }
.lagoon .empty-state { background: #f7faf3; border: 1px dashed #cedfd2; border-radius: 16px; padding: 30px 18px; }
.lagoon .empty-state svg { color: #4e9c8c; }
.lagoon .sidebar-actions { border-color: #dce8df; }
.lagoon .form-grid { align-items: center; }
.lagoon .goal-grid > .wq-card { min-width: 0; border-top: 3px solid #78b8ab; }
.lagoon .toggle-row { padding: 12px 0; }
.lagoon .toggle-row input { flex-shrink: 0; }
.lagoon .goal-contribution-row { padding-top: 14px; border-top: 1px solid #e2ebe3; }
.lagoon button:disabled { cursor: not-allowed; opacity: .55; }
@media (max-width: 700px) {
 .lagoon .form-grid { grid-template-columns: minmax(0, 1fr); }
 .lagoon .goal-grid, .lagoon .achievement-grid { grid-template-columns: minmax(0, 1fr); }
 .lagoon .page-header { padding: 22px 20px; }
 .lagoon .game-level { padding: 16px; gap: 12px; }
 .lagoon .level-badge { width: 56px; height: 56px; font-size: 24px; }
 .lagoon .level-details { min-width: 0; }
 .lagoon .modal-backdrop { padding: 12px; }
 .lagoon .modal-card { padding: 18px; max-height: 92dvh; }
 .lagoon .quick-category-grid { gap: 7px; }
 .lagoon .choice-button { padding: 11px 8px; font-size: 13px; }
 .lagoon .transaction-main p { overflow-wrap: anywhere; }
}
@media print {
 .lagoon { background: white !important; color: #153d45; }
 .lagoon .page-header { background: white; border: 0; padding: 0; }
 .lagoon .report-grid > div { background: white; border-color: #ccd8cf; }
 .lagoon .wq-card { box-shadow: none; }
}

/* 2026 information-architecture and balance-warning update */
.lagoon .balance-card { position: relative; overflow: hidden; }
.lagoon .balance-card.balance-warning { border-color: #e2b86a; background: #fffaf0; }
.lagoon .balance-card.balance-critical { border-color: #d87866; background: #fff2ef; box-shadow: 0 0 0 1px #d8786622, 0 12px 30px #7b2e2110; }
.lagoon .balance-card.balance-critical .stat-value,
.lagoon .balance-card.balance-critical .lagoon-stat-top { color: #a43f31; }
.lagoon .balance-overspent { margin: 8px 0 0; color: #a43f31; font-size: 12px; font-weight: 700; }
.lagoon .lagoon-alert-danger { border-color: #e3a497; background: #fff0ec; color: #8f3328; }
.lagoon .home-review-card { margin-top: 22px; }
.lagoon .home-budget-manager { scroll-margin-top: 24px; margin-top: 26px; }
.lagoon .home-budget-manager > .wq-card { margin-bottom: 16px; }
.lagoon .home-section-heading { margin: 0 0 14px; }
.lagoon .home-section-heading h2, .lagoon .icon-heading, .lagoon .insights-report-card h2 { display: flex; align-items: center; gap: 8px; }
.lagoon .settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.lagoon .world-rules { margin-top: 16px; color: var(--quiet); font-size: 13px; line-height: 1.6; }
.lagoon .settings-achievements { margin-bottom: 16px; }
.lagoon .insights-report-card .section-title-row { align-items: flex-start; }
html[dir="rtl"] .lagoon { text-align: right; }
html[dir="rtl"] .lagoon .sidebar-nav .nav-button,
html[dir="rtl"] .lagoon .section-title-row,
html[dir="rtl"] .lagoon .lagoon-stat-top,
html[dir="rtl"] .lagoon .summary-list > div { direction: rtl; }
@media (max-width: 760px) {
  .lagoon .settings-grid { grid-template-columns: minmax(0, 1fr); }
  .lagoon .insights-report-card .section-title-row { align-items: stretch; }
}

`
