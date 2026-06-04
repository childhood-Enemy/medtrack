import {
    FileText,
    ClipboardList,
    Home,
    Pill,
} from "lucide-react";

export const INVENTORY_STATUS_CODES = {
    SENT: 'sent',
    AWAITING_CONFIRMATION: 'awaiting confirmation',
    CONFIRMED: 'confirmed',
    PARTIALLY_RECEIVED: 'partially received',
    RECEIVED: 'received',
};

export const STATUS_OPTIONS = [
    "draft",
    "sent",
    "awaiting confirmation",
    "confirmed",
    "partially received",
    "received",
    "cancelled",
    "overdue",
];

export const ROUTES =
    [
        {
            label: "Home",
            key: "home",
            icon: Home
        },
        {
            label: "Orders",
            key: "orders",
            icon: ClipboardList
        },
        {
            label: "Invoice",
            key: "invoice",
            icon: FileText
        },
        {
            label: "Medicines",
            key: "medicines",
            icon: Pill
        }
    ];

export const PILL_OPTIONS = [
    {
        label: "Low Supply",
        value: "low-supply",
        property: "lowStockMedicines",
        styling: "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200",
        bg:"bg-amber-100"
    },
    {
        label: "Refill Soon",
        value: "critical",
        property: "refillSoonMedicines",
        styling: "bg-red-100 text-red-800 border-red-300 hover:bg-red-200",
        bg:"bg-red-100"
    },
];

export const STATUS = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
};