export const LOGIN_DOMAIN = 'champions-bolao.app'

export function normalizeUsername(value = '') {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function emailForUsername(username) {
  const normalized = normalizeUsername(username)
  return `${normalized}@${LOGIN_DOMAIN}`
}
