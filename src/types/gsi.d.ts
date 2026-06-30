// Minimal type declarations for the Google Identity Services (GIS) client.
// Loaded at runtime from https://accounts.google.com/gsi/client.

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: { credential?: string; select_by?: string }) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
}

interface GoogleButtonOptions {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: number | string;
}

interface GoogleAccountsId {
  initialize: (config: GoogleIdConfiguration) => void;
  renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
  prompt: () => void;
  cancel: () => void;
  disableAutoSelect: () => void;
}

interface Window {
  google?: {
    accounts?: {
      id: GoogleAccountsId;
    };
  };
}
