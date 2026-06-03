import { AlertTriangle,CheckCircle2  } from "lucide-react";

export const TextField = ({ label, value, onChange }) => {
    return (
        <div>
            <label className="label">{label}</label>
            <input className="field" value={value} onChange={(event) => onChange(event.target.value)} />
        </div>
    );
}
export const DateField = ({ label, value, onChange }) => {
    return (
        <div>
            <label className="label">{label}</label>
            <input className="field" type="date" value={value} onChange={(event) => onChange(event.target.value)} />
        </div>
    );
}

export const NumberField = ({ label, value, onChange, step = "1" }) => {
    return (
        <div>
            <label className="label">{label}</label>
            <input
                className="field"
                inputMode="decimal"
                onChange={(event) => onChange(event.target.value)}
                step={step}
                type="number"
                value={value}
            />
        </div>
    );
}
export const InlineAlert = ({ tone, text }) => {
    const classes =
        tone === "error"
            ? "border-red-300 bg-red-50 text-red-800"
            : tone === "warn"
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-emerald-300 bg-emerald-50 text-emerald-900";
    return (
        <div className={`mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${classes}`}>
            {tone === "error" || tone === "warn" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            {text}
        </div>
    );
}

export default () => {};


