/** I4: toate URL-urile de resurse trec prin acest helper, ca să funcționeze și sub basePath. */
export const asset = (path: string): string => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`;
