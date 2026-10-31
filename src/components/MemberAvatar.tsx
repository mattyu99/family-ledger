import React from 'react';
import {
  Image,
  StyleProp,
  TextStyle,
  } from 'react-native';
import { Text } from './common/Text';


export interface MemberAvatarProps {
  avatar?: string;
  avatarUrl?: string;
  size?: number;
  style?: StyleProp<TextStyle>;
}

export const MemberAvatar: React.FC<MemberAvatarProps> = ({ avatar, avatarUrl, size = 20, style }) => {
  const targetAvatar = avatarUrl || avatar;
  if (targetAvatar && (targetAvatar.startsWith('http://') || targetAvatar.startsWith('https://'))) {
    return (
      <Image
        source={{ uri: targetAvatar }}
        style={{ width: size, height: size, borderRadius: size / 2, marginRight: 6 }}
        resizeMode="cover"
      />
    );
  }
  return (
    <Text style={[style || { fontSize: 18, marginRight: 6 }]}>
      {targetAvatar || '👤'}
    </Text>
  );
};

export const renderMemberAvatar = (avatar: string | undefined, textStyle?: any, size: number = 20) => {
  return <MemberAvatar avatar={avatar} style={textStyle} size={size} />;
};
