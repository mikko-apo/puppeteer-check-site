export interface FailUrlStatus {
  url: string;
  status?: number | string;
  errorText?: string;
}

export interface ErrorInfo {
  message?: string;
  stack?: string;
}

export interface PageResult {
  url: string;
  external?: boolean;
  originalUrl?: string;
  errors?: ErrorInfo[];
  pageErrors?: ErrorInfo[];
  failed?: FailUrlStatus[];
  ignored?: string[];
  hrefs?: string[];
  succeeded?: string[];

  [index: string]: any;
}