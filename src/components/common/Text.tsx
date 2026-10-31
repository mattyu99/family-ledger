import React, { forwardRef, useMemo } from 'react';
import {
  Text as RNText,
  TextProps as RNTextProps,
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  StyleSheet,
} from 'react-native';
import { useFontSize } from '../../theme/FontSizeContext';

export interface TextProps extends RNTextProps {
  disableScaling?: boolean;
}

export const Text = forwardRef<RNText, TextProps>(
  ({ style, allowFontScaling, maxFontSizeMultiplier, disableScaling = false, ...rest }, ref) => {
    const { fontScale, followSystemFont } = useFontSize();

    const scaledStyle = useMemo(() => {
      if (disableScaling || fontScale === 1.0) return style;
      const flat = StyleSheet.flatten(style);
      if (!flat || typeof flat.fontSize !== 'number') return style;
      return [
        style,
        {
          fontSize: Math.round(flat.fontSize * fontScale * 10) / 10,
          ...(flat.lineHeight ? { lineHeight: Math.round(flat.lineHeight * fontScale * 10) / 10 } : {}),
        },
      ];
    }, [style, fontScale, disableScaling]);

    return (
      <RNText
        ref={ref}
        style={scaledStyle}
        allowFontScaling={allowFontScaling !== undefined ? allowFontScaling : followSystemFont}
        maxFontSizeMultiplier={followSystemFont ? (maxFontSizeMultiplier ?? 1.30) : 1.0}
        {...rest}
      />
    );
  }
);
Text.displayName = 'Text';

export interface TextInputProps extends RNTextInputProps {
  disableScaling?: boolean;
}

export const TextInput = forwardRef<RNTextInput, TextInputProps>(
  ({ style, allowFontScaling, maxFontSizeMultiplier, disableScaling = false, ...rest }, ref) => {
    const { fontScale, followSystemFont } = useFontSize();

    const scaledStyle = useMemo(() => {
      if (disableScaling || fontScale === 1.0) return style;
      const flat = StyleSheet.flatten(style);
      if (!flat || typeof flat.fontSize !== 'number') return style;
      return [
        style,
        {
          fontSize: Math.round(flat.fontSize * fontScale * 10) / 10,
          ...(flat.lineHeight ? { lineHeight: Math.round(flat.lineHeight * fontScale * 10) / 10 } : {}),
        },
      ];
    }, [style, fontScale, disableScaling]);

    return (
      <RNTextInput
        ref={ref}
        style={scaledStyle}
        allowFontScaling={allowFontScaling !== undefined ? allowFontScaling : followSystemFont}
        maxFontSizeMultiplier={followSystemFont ? (maxFontSizeMultiplier ?? 1.30) : 1.0}
        {...rest}
      />
    );
  }
);
TextInput.displayName = 'TextInput';

export const AppText = Text;
export const AppTextInput = TextInput;

export default Text;
