import { Platform, Alert, Clipboard } from 'react-native';

export const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
    }
  } else {
    Alert.alert(title, message);
  }
};

export const showConfirm = (
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void
) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    } else if (onCancel) {
      onCancel();
    }
  } else {
    Alert.alert(
      title,
      message,
      [
        {
          text: '取消',
          style: 'cancel',
          onPress: onCancel,
        },
        {
          text: '確定',
          onPress: onConfirm,
        },
      ],
      { cancelable: true }
    );
  }
};

export const copyToClipboard = async (text: string, successMsg: string) => {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      showAlert('已複製', successMsg);
      return;
    }
    if (Clipboard && typeof Clipboard.setString === 'function') {
      Clipboard.setString(text);
      showAlert('已複製', successMsg);
      return;
    }
    showAlert('已複製', `${successMsg}\n\n${text}`);
  } catch {
    showAlert('已複製', text);
  }
};
