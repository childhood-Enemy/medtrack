import { map } from "lodash";
export function PillButton(properties) {
    const { selectedTab, options, onChange } = properties;

    return (
        <div className="flex flex-wrap inventory-toggle">
            {map(options, (option) => {
                const { value, label, styling } = option;
                return (<button
                    key={value}
                    className={`${styling} items-center gap-2 px-4 py-2 m-2 border rounded-full font-semibold text-sm transition-all duration-200 pill ${value === selectedTab ? "active" : ""}`}
                    onClick={() => onChange(value)}
                >
                    {label}
                </button>);
            }
            )}
        </div>
    );
}


