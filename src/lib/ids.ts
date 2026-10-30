/** Identificator scurt pentru entități noi (obiecte etc.); unicitatea o garantează `addObject`/`duplicateObject` prin reîncercare. */
export const newId = (): string => crypto.randomUUID().slice(0, 8);
