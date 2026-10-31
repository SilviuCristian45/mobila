'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Interfața afișată după o eroare de randare. Primește DOAR `reset`, nu eroarea: mesajele și stack trace-urile
   * excepțiilor nu ajung în interfață (se scriu doar în consola dezvoltatorului).
   */
  fallback: (api: { reset: () => void }) => ReactNode;
  /** Numele zonei, pentru consola dezvoltatorului. */
  label: string;
  /** Când se schimbă, o eroare afișată se șterge singură (de ex. altă sesiune, altă revizie). */
  resetKey?: unknown;
  /** Apelat la „Încearcă din nou”, înainte de a reîncerca randarea copiilor. */
  onReset?: () => void;
}

/**
 * Graniță de erori pentru o zonă care poate eșua independent: restul interfeței rămâne în picioare. Nu atinge
 * persistența: starea (sesiunea, documentul) trăiește în afara arborelui React și supraviețuiește remontării.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[RoomCraft] eroare în „${this.props.label}”`, error, info.componentStack);
  }

  override componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (this.state.failed && !Object.is(prev.resetKey, this.props.resetKey)) this.reset();
  }

  private reset = (): void => {
    this.props.onReset?.();
    this.setState({ failed: false });
  };

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback({ reset: this.reset }) : this.props.children;
  }
}
