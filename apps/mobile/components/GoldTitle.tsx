import { StyleSheet, Text, type TextStyle } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

import { fonts, goldGradient } from "../lib/theme";

type Props = {
  children: string;
  style?: TextStyle;
};

/** Renders text filled with the app's gold gradient - React Native text can't take a
 * gradient fill directly, so this masks a gradient rectangle with the text's shape. */
export function GoldTitle({ children, style }: Props) {
  return (
    <MaskedView maskElement={<Text style={[styles.text, style]}>{children}</Text>}>
      <LinearGradient
        colors={goldGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={[styles.text, style, styles.transparent]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: fonts.displayBold,
    fontSize: 48,
    letterSpacing: 6,
    textAlign: "center",
  },
  transparent: {
    opacity: 0,
  },
});
