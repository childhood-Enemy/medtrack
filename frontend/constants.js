
export const INVENTORY_STATUS_CODES = {
    SENT: 'sent',
    AWAITING_CONFIRMATION: 'awaiting confirmation',
    CONFIRMED: 'confirmed',
    PARTIALLY_RECEIVED: 'partially received',
    RECEIVED: 'received',
};

export const ROUTES = {
    HOME: '/',
    LOGIN: '/login',
    DASHBOARD: '/dashboard',
    INVENTORY: '/inventory',
    ORDERS: '/orders',
    SETTINGS: '/settings',
};

export const PILL_OPTIONS = [
    {
        label: "Critical",
        value: "critical",
        property: "refillSoonMedicines",
        styling:"alert-pill alert-pill-critical"
    },
    {
        label: "Low Supply",
        value: "low-supply",
        property: "lowStockMedicines",
        styling:"alert-pill alert-pill-warning"
    }
];

export const STATUS = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
};
