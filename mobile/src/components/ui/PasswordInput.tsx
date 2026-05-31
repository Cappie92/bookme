import { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const TEXT_COLOR = '#2D2D2D';
const PLACEHOLDER_COLOR = '#999999';

export type PasswordInputProps = Omit<
  TextInputProps,
  'secureTextEntry' | 'value' | 'onChangeText' | 'style'
> & {
  value: string;
  onChangeText: (text: string) => void;
  error?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
};

export function PasswordInput({
  value,
  onChangeText,
  placeholder,
  editable = true,
  error = false,
  containerStyle,
  inputStyle,
  testID,
  accessibilityLabel = 'Пароль',
  ...rest
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View
      style={[styles.container, error && styles.containerError, containerStyle]}
    >
      <TextInput
        {...rest}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        style={[styles.input, inputStyle]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER_COLOR}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
        textContentType="password"
        importantForAutofill="yes"
      />
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setVisible((v) => !v)}
        disabled={!editable}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Скрыть пароль' : 'Показать пароль'}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={visible ? 'eye-outline' : 'eye-off-outline'}
          size={22}
          color="#666666"
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dddddd',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    minHeight: 48,
  },
  containerError: {
    borderColor: '#ff0000',
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 8,
    fontSize: 16,
    color: TEXT_COLOR,
    backgroundColor: 'transparent',
  },
  toggle: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
