interface TranslatedCategory {
  nombre_cuenta: string
}

export function sortCategoriesByTranslatedName<T extends TranslatedCategory>(
  categories: T[],
  translate: (key: string) => string
): T[] {
  return [...categories].sort((a, b) =>
    translate(a.nombre_cuenta).localeCompare(translate(b.nombre_cuenta), 'es', { sensitivity: 'base' })
  )
}
