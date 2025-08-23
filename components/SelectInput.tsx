import React from 'react';

interface SelectInputProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string | number; label: string; disabled?: boolean }>; 
  containerClassName?: string;
  placeholder?: string; 
}

export const SelectInput: React.FC<SelectInputProps> = ({
  label,
  options,
  id,
  className = '',
  containerClassName = '',
  placeholder,
  ...props
}) => {
  const baseInputStyle = `block w-full bg-brand-bg-primary rounded-lg shadow-neumorphic-pressed py-2.5 px-3 
                          focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent 
                          border-transparent text-brand-text-primary sm:text-sm`; // Focus ring now red
  const labelColor = 'text-brand-text-secondary';
  // Option and Optgroup styling is primarily handled by global CSS in index.html

  return (
    <div className={`mb-4 ${containerClassName}`}>
      {label && (
        <label htmlFor={id || props.name} className={`block text-sm font-medium mb-1.5 ${labelColor}`}>
          {label}
        </label>
      )}
      <select
        id={id || props.name}
        className={`${baseInputStyle} ${className}`}
        {...props}
      >
        {placeholder && <option value="" className="text-brand-text-secondary">{placeholder}</option>}
        {options.map(option => {
            // Optgroup-like options are styled globally via CSS for value^="__optgroup__"
            if (typeof option.value === 'string' && option.value.startsWith('__optgroup__')) {
                return ( 
                    <option key={option.value} value={option.value} disabled className="optgroup-label">
                        {option.label}
                    </option>
                );
            }
            // Regular options are styled globally via CSS
            return ( 
                <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                </option>
            );
        })}
      </select>
    </div>
  );
};