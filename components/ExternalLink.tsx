import { type ComponentProps } from 'react';
import { Linking, TouchableOpacity } from 'react-native';

type Props = Omit<ComponentProps<typeof TouchableOpacity>, 'onPress'> & { href: string };

export function ExternalLink({ href, ...rest }: Props) {
  return (
    <TouchableOpacity
      {...rest}
      onPress={async () => {
        await Linking.openURL(href);
      }}
    />
  );
}
