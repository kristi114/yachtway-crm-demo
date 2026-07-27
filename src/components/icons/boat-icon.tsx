import { forwardRef, type SVGProps } from "react";

interface BoatIconProps extends Omit<SVGProps<SVGSVGElement>, "size"> {
  size?: number | string;
}

/**
 * Custom boat icon used as the "inventory / listings" symbol across the app.
 * Mirrors the lucide-react API (size, className, currentColor) so it can be
 * dropped in as a replacement for the previous `Ship` icon.
 */
export const BoatIcon = forwardRef<SVGSVGElement, BoatIconProps>(
  ({ size = 24, className, ...props }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.84494 6.00021H14.0549C14.3335 6.00021 14.5937 6.13948 14.7483 6.37131L16.7238 9.33322H22.9446C23.2516 9.3333 23.5338 9.5021 23.6789 9.77268C23.824 10.0434 23.8081 10.3724 23.6379 10.6281L20.1936 15.8059C19.8133 16.3782 19.2973 16.8475 18.6916 17.1721C18.1615 17.4562 17.5771 17.6217 16.9787 17.6584L16.7219 17.6662H1.83322C1.55996 17.6662 1.30434 17.5324 1.14865 17.3078C0.992974 17.0832 0.956982 16.7962 1.05295 16.5403L2.71994 12.0959L2.77365 11.9797C2.91959 11.7204 3.19618 11.5559 3.50022 11.5559H4.54611L5.71408 7.66623H5.16623C4.70599 7.66623 4.33322 7.29346 4.33322 6.83322C4.33322 6.37298 4.70599 6.00021 5.16623 6.00021H6.80783C6.82017 5.99984 6.83254 6.00003 6.84494 6.00021ZM15.8508 11.0041C15.4487 11.0239 15.0521 11.1111 14.6779 11.2619L14.675 11.2629L10.7199 12.841L10.719 12.8401C10.095 13.0911 9.42864 13.221 8.75607 13.2219H4.07834L3.03537 16.0002H16.7229C17.1351 16.0003 17.5411 15.8981 17.9045 15.7033C18.268 15.5085 18.5777 15.2265 18.8059 14.883L21.3889 11.0002H16.0237L15.8508 11.0041ZM6.28635 11.5559H8.75412C9.2151 11.5553 9.67227 11.4655 10.0998 11.2932L10.1018 11.2922L14.0578 9.71506C14.3043 9.61589 14.5573 9.53563 14.8147 9.47482L13.6086 7.66623H7.45334L6.28635 11.5559Z"
      />
    </svg>
  ),
);
BoatIcon.displayName = "BoatIcon";

export default BoatIcon;
