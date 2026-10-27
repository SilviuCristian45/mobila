/** Eroare aruncată când un calcul din aval (buget, scenă) primește un document invalid geometric/referențial. */
export class InvalidDocumentError extends Error {
  constructor(
    message: string,
    public readonly issues: ReadonlyArray<{ code: string; path: string; message: string }>,
  ) {
    super(message);
    this.name = 'InvalidDocumentError';
  }
}
