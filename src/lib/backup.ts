export const formatLastBackupText = (isoString: string | null): string => {
  if (!isoString) return '尚未進行過手動/雲端備份';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '尚未進行過手動/雲端備份';

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  let relative = '';
  if (diffMins < 1) relative = '剛剛';
  else if (diffMins < 60) relative = `${diffMins} 分鐘前`;
  else if (diffHours < 24) relative = `${diffHours} 小時前`;
  else relative = `${diffDays} 天前`;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');

  return `${yyyy}/${mm}/${dd} ${hh}:${min} (${relative})`;
};

