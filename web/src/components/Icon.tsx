import type { SVGProps } from "react";

export type IconName =
  | "profile"
  | "shield"
  | "palette"
  | "logout"
  | "lock"
  | "mail"
  | "device"
  | "sun"
  | "moon"
  | "check"
  | "communities"
  | "opportunity"
  | "search"
  | "heart"
  | "message"
  | "bookmark"
  | "calendar"
  | "pin"
  | "arrowUpRight"
  | "arrowLeft";

const paths: Record<IconName, string> = {
  profile: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
  shield: "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Zm-3-11 2 2 4-4",
  palette:
    "M12 22a10 10 0 1 1 10-10c0 1.7-1.3 3-3 3h-1.8a1.7 1.7 0 0 0-1.4 2.7c.6.9.1 2.3-1 2.3H12ZM7.5 10h.01M10 6.5h.01M14 6.5h.01M16.5 10h.01",
  logout: "M10 17l5-5-5-5m5 5H3m9-9h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 1 1 8 0v4m-4 4v2",
  mail: "M4 5h16v14H4zM4 7l8 6 8-6",
  device: "M4 4h16v13H4zM9 21h6m-3-4v4",
  sun: "M12 3v2m0 14v2M5.6 5.6 7 7m10 10 1.4 1.4M3 12h2m14 0h2M5.6 18.4 7 17m10-10 1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  moon: "M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z",
  check: "m5 12 4 4L19 6",
  communities:
    "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m2-11a4 4 0 1 0 8 0m4 11v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  opportunity: "M3 7h18v14H3zM8 7V4h8v3m-13 5h18m-10 0v2h2v-2",
  search: "m20 20-4.5-4.5M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z",
  message:
    "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z",
  bookmark: "M6 4h12v17l-6-4-6 4z",
  calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z",
  pin: "M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  arrowUpRight: "M7 17 17 7M7 7h10v10",
  arrowLeft: "M19 12H5m7 7-7-7 7-7",
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="20"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
