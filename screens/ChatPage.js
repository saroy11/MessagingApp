import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ImageViewer from 'react-native-image-zoom-viewer';
import { auth, firestore } from '../firebase';

// Array of random colors for the profile circles
const profileColors = [
  '#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#A1FF33', '#57FF33',
  '#33A1FF', '#FFB533', '#33FFB5', '#B533FF', '#FF336B', '#336BFF',
];

// Helper function to get a random color
const getRandomColor = (id) => {
  if (!id) return '#ccc';
  const idString = String(id);
  const hash = idString.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return profileColors[hash % profileColors.length];
};

const normalizePhone = (phone) => {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

const getMimeType = (fileName) => {
  const extension = fileName.split('.').pop().toLowerCase();
  const mimeTypes = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
  };
  return mimeTypes[extension] || 'application/octet-stream';
};

function AnimatedMessageBubble({ item, isMe, textStyle, messageStyle, isEmojiOnly, onImagePress, receiptLabel }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        tension: 65,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateY]);

  if (item.attachmentUrl && item.attachmentType === 'image') {
    return (
      <Animated.View style={[messageStyle, { opacity: fadeAnim, transform: [{ translateY }] }]}>
        <TouchableOpacity onPress={onImagePress}>
          <Image source={{ uri: item.attachmentUrl }} style={styles.imageAttachment} />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  if (item.attachmentUrl && item.attachmentType === 'voice') {
    return <VoiceMessage item={item} isMe={isMe} />;
  }

  if (item.attachmentUrl) {
    return (
      <Animated.View style={[messageStyle, { opacity: fadeAnim, transform: [{ translateY }] }]}>
        <TouchableOpacity onPress={() => Linking.openURL(item.attachmentUrl)} style={styles.documentAttachment}>
          <MaterialIcons name="insert-drive-file" size={24} color="#007AFF" />
          <Text style={styles.documentText}>{item.fileName || 'Document'}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[messageStyle, { opacity: fadeAnim, transform: [{ translateY }] }]}>
      {isEmojiOnly ? (
        <Text style={styles.emojiMessage}>{item.text}</Text>
      ) : (
        <View style={[styles.textBubble, isMe ? styles.myBubble : styles.otherBubble]}>
          <Text style={textStyle}>{item.text}</Text>
          <Text style={[styles.messageTime, isMe ? styles.myMessageTime : styles.otherMessageTime]}>
            {formatMessageTime(item.createdAt)}{receiptLabel ? ` · ${receiptLabel}` : ''}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const isEmojiOnly = (text) => {
  if (!text || !text.trim()) return false;

  const remainingText = text.replace(
    /[\p{Extended_Pictographic}\p{Regional_Indicator}\u200D\uFE0F\u20E3\u{1F3FB}-\u{1F3FF}\s]/gu,
    ''
  );

  return remainingText.length === 0;
};

const formatMessageTime = (timestamp) => {
  if (!timestamp?.seconds) return '';
  return new Date(timestamp.seconds * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatDuration = (seconds) => {
  const wholeSeconds = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
};

const formatLastSeen = (profile) => {
  if (profile?.isOnline) return 'online';
  if (profile?.lastSeenEnabled === false || !profile?.lastSeen?.seconds) return '';
  const date = new Date(profile.lastSeen.seconds * 1000);
  return `last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

function VoiceMessage({ item, isMe }) {
  const player = useAudioPlayer(item.attachmentUrl, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || item.durationSeconds || 0;
  return (
    <View style={[styles.voiceBubble, isMe ? styles.myBubble : styles.otherBubble]}>
      <TouchableOpacity onPress={() => status.playing ? player.pause() : player.play()} style={styles.voicePlayButton}>
        <MaterialIcons name={status.playing ? 'pause' : 'play-arrow'} size={23} color={isMe ? '#2563EB' : '#FFFFFF'} />
      </TouchableOpacity>
      <View style={styles.voiceDetails}>
        <View style={styles.voiceWave}><View style={styles.voiceWaveFill} /></View>
        <Text style={[styles.voiceDuration, isMe ? styles.myMessageTime : styles.otherMessageTime]}>{formatDuration(status.currentTime || duration)}</Text>
      </View>
    </View>
  );
}

export default function ChatPage({ route, navigation }) {
  const { userId, name, myPhone, profilePicUrl, groupId, groupName } = route.params;
  const isGroupChat = Boolean(groupId);
  const chatTitle = groupName || name || 'Chat';
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState('');
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState(0);
  const [contactProfile, setContactProfile] = useState(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const typingTimeoutRef = useRef(null);
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const CLOUDINARY_UPLOAD_PRESET = 'iChatUpload';
  const CLOUDINARY_CLOUD_NAME = 'dy6fcosvb';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: () => (
        <View style={styles.headerTitleContainer}>
          {profilePicUrl ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`View ${name || 'contact'} profile photo`}
              onPress={() => {
                setModalImageUrl(profilePicUrl);
                setModalVisible(true);
              }}
            >
              <Image source={{ uri: profilePicUrl }} style={styles.profileImage} />
            </TouchableOpacity>
          ) : (
            <View style={[styles.profilePicPlaceholder, { backgroundColor: getRandomColor(userId) }]}>
              <Text style={styles.profilePicText}>
                {name && typeof name === 'string' ? name.charAt(0).toUpperCase() : ''}
              </Text>
            </View>
          )}
          <View>
            <Text style={styles.headerTitle}>{chatTitle}</Text>
            {isOtherTyping ? <Text style={styles.typingLabel}>typing…</Text> : <Text style={styles.presenceLabel}>{isGroupChat ? 'Group chat' : formatLastSeen(contactProfile)}</Text>}
          </View>
        </View>
      ),
      headerRight: () => !isGroupChat ? (
        <TouchableOpacity onPress={() => Alert.alert('Report contact?', 'This will send a report to the app moderators.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Report', style: 'destructive', onPress: () => addDoc(collection(firestore, 'reports'), { reportedPhone: normalizePhone(userId), reportedBy: normalizePhone(myPhone), createdAt: serverTimestamp() }).catch((error) => Alert.alert('Could not send report', error.message)) },
        ])} style={{ marginRight: 16 }}>
          <MaterialIcons name="report-gmailerrorred" size={24} color="#DC2626" />
        </TouchableOpacity>
      ) : null,
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 16 }}>
          <MaterialIcons name="arrow-back" size={28} color="#007AFF" />
        </TouchableOpacity>
      ),
      headerStyle: {
        backgroundColor: 'white',
      },
    });
  }, [navigation, userId, name, profilePicUrl, isOtherTyping, chatTitle, isGroupChat, contactProfile, myPhone]);

  const handleAttachment = async () => {
    if (isUploading) return;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Image', 'Document'], cancelButtonIndex: 0 },
        (buttonIndex) => {
          if (buttonIndex === 1) pickImage();
          else if (buttonIndex === 2) pickDocument();
        }
      );
    } else {
      Alert.alert(
        'Send Attachment',
        'Choose attachment type:',
        [
          { text: 'Image', onPress: pickImage },
          { text: 'Document', onPress: pickDocument },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const pickImage = async () => {
    try {
      setIsUploading(true);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission to access media library is required!');
        setIsUploading(false);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        const name = asset.fileName || asset.uri.split('/').pop();
        await uploadAndSendAttachment(asset.uri, 'image', name);
      } else {
        setIsUploading(false);
      }
    } catch (err) {
      alert('Image pick failed: ' + (err.message || err));
      console.error('Image pick error:', err);
      setIsUploading(false);
    }
  };

  const pickDocument = async () => {
    try {
      setIsUploading(true);
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
      });
      if (!result.assets || result.assets.length === 0) {
        setIsUploading(false);
        return;
      }
      const { uri, name, mimeType } = result.assets[0];
      const fileName = name || uri.split('/').pop();
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) throw new Error('File does not exist at URI: ' + uri);
      await uploadAndSendAttachment(uri, 'doc', fileName, mimeType);
    } catch (err) {
      alert('Document pick failed: ' + (err.message || err));
      console.error('Document pick error:', err);
      setIsUploading(false);
    }
  };

  const uploadAndSendAttachment = async (uri, type, fileName, mimeType = null, durationSeconds = null) => {
    try {
      const fileType = fileName.split('.').pop().toLowerCase();
      const uploadUrl = type === 'image'
        ? `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`
        : `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`;
      const formData = new FormData();
      formData.append('file', {
        uri,
        type: type === 'image' ? `image/${fileType}` : (mimeType || getMimeType(fileName)),
        name: fileName || `upload.${fileType}`,
      });
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      const response = await fetch(uploadUrl, { method: 'POST', body: formData });
      const data = await response.json();
      if (!data.secure_url) throw new Error(`Cloudinary upload failed: ${data.error?.message || 'Unknown error'}`);
      await addDoc(collection(firestore, 'messages'), {
        from: normalizePhone(myPhone),
        ...(isGroupChat ? { groupId } : { chatWith: normalizePhone(userId) }),
        text: '',
        attachmentUrl: data.secure_url,
        attachmentType: type,
        fileName: fileName || null,
        durationSeconds,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      alert('Failed to send attachment: ' + (err.message || err));
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const toggleVoiceRecording = async () => {
    try {
      if (!recorderState.isRecording) {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Microphone permission needed', 'Allow microphone access to record a voice message.');
          return;
        }
        await recorder.prepareToRecordAsync();
        recorder.record();
        return;
      }

      await recorder.stop();
      if (!recorder.uri) return;
      const durationSeconds = Math.round((recorderState.durationMillis || 0) / 1000);
      setIsUploading(true);
      await uploadAndSendAttachment(recorder.uri, 'voice', `voice-${Date.now()}.m4a`, 'audio/m4a', durationSeconds);
    } catch (error) {
      console.error('Voice recording failed:', error);
      Alert.alert('Voice message failed', error.message || 'Please try again.');
      setIsUploading(false);
    }
  };

  const markConversationAsRead = async () => {
    if (isGroupChat) return;
    if (!myPhone || !userId) return;

    const normalizedMyPhone = normalizePhone(myPhone);
    const normalizedUserId = normalizePhone(userId);

    await setDoc(
      doc(firestore, 'conversationState', `${normalizedMyPhone}_${normalizedUserId}`),
      {
        myPhone: normalizedMyPhone,
        userId: normalizedUserId,
        lastReadAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  useEffect(() => {
    markConversationAsRead();
  }, [myPhone, userId, isGroupChat]);

  useEffect(() => {
    if (!auth.currentUser || isGroupChat) return undefined;
    const ownProfile = onSnapshot(doc(firestore, 'users', auth.currentUser.uid), (snapshot) => {
      setIsBlocked((snapshot.data()?.blockedPhones || []).includes(normalizePhone(userId)));
    });
    const contactProfileQuery = query(collection(firestore, 'users'), where('phone', '==', Number(normalizePhone(userId))));
    const otherProfile = onSnapshot(contactProfileQuery, (snapshot) => setContactProfile(snapshot.empty ? null : snapshot.docs[0].data()));
    return () => { ownProfile(); otherProfile(); };
  }, [userId, isGroupChat]);

  useEffect(() => {
    if (!myPhone || (!userId && !groupId)) return;
    const normalizedMyPhone = normalizePhone(myPhone);
    const normalizedUserId = normalizePhone(userId);

    const messagesQuery = query(collection(firestore, 'messages'));

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const data = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((msg) => !isBlocked && (isGroupChat
          ? msg.groupId === groupId
          : (normalizePhone(msg.from) === normalizedMyPhone && normalizePhone(msg.chatWith) === normalizedUserId) ||
            (normalizePhone(msg.from) === normalizedUserId && normalizePhone(msg.chatWith) === normalizedMyPhone)))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMessages(data);
    });
    return () => unsubscribe();
  }, [myPhone, userId, groupId, isGroupChat, isBlocked]);

  useEffect(() => {
    if (!myPhone || !userId || isGroupChat) return undefined;
    const mine = normalizePhone(myPhone);
    const other = normalizePhone(userId);
    const unsubscribeTyping = onSnapshot(doc(firestore, 'typing', `${other}_${mine}`), (snapshot) => {
      const typing = snapshot.data();
      setIsOtherTyping(Boolean(typing?.isTyping) && Date.now() - Number(typing.updatedAtMs || 0) < 4000);
    });
    const unsubscribeRead = onSnapshot(doc(firestore, 'conversationState', `${other}_${mine}`), (snapshot) => {
      setOtherReadAt(snapshot.data()?.lastReadAt?.seconds || 0);
    });
    return () => {
      unsubscribeTyping();
      unsubscribeRead();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [myPhone, userId, isGroupChat]);

  const setTyping = async (isTyping) => {
    if (!myPhone || !userId || isGroupChat) return;
    await setDoc(doc(firestore, 'typing', `${normalizePhone(myPhone)}_${normalizePhone(userId)}`), {
      from: normalizePhone(myPhone),
      to: normalizePhone(userId),
      isTyping,
      updatedAtMs: Date.now(),
    }, { merge: true });
  };

  const handleMessageChange = (value) => {
    setMessage(value);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (!value.trim()) {
      setTyping(false).catch(() => {});
      return;
    }
    setTyping(true).catch(() => {});
    typingTimeoutRef.current = setTimeout(() => setTyping(false).catch(() => {}), 1500);
  };

  const sendMessage = async () => {
    if (isBlocked) {
      Alert.alert('Contact blocked', 'Unblock this contact in Settings before sending a message.');
      return;
    }
    if (!myPhone || (!userId && !groupId) || message.trim().length === 0) return;
    await addDoc(collection(firestore, 'messages'), {
      from: normalizePhone(myPhone),
      ...(isGroupChat ? { groupId } : { chatWith: normalizePhone(userId) }),
      text: message,
      createdAt: serverTimestamp(),
    });
    setMessage('');
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setTyping(false).catch(() => {});
    markConversationAsRead();
  };

  const renderMessage = ({ item }) => {
    const isMe = normalizePhone(item.from) === normalizePhone(myPhone);
    const emojiOnly = isEmojiOnly(item.text);
    const messageStyle = [isMe ? styles.myMessage : styles.otherMessage];
    const textStyle = isMe ? styles.myText : styles.otherText;
    const messageSeconds = item.createdAt?.seconds || 0;
    const receiptLabel = isMe && messageSeconds ? (otherReadAt >= messageSeconds ? 'Read' : 'Delivered') : null;

    return (
      <View style={messageStyle}>
        <AnimatedMessageBubble
          item={item}
          isMe={isMe}
          textStyle={textStyle}
          messageStyle={messageStyle}
          isEmojiOnly={emojiOnly}
          onImagePress={() => {
            setModalImageUrl(item.attachmentUrl);
            setModalVisible(true);
          }}
          receiptLabel={receiptLabel}
        />
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
      <View style={styles.chatContainer}>
        {isBlocked ? <View style={styles.blockedBanner}><MaterialIcons name="block" size={17} color="#B42318" /><Text style={styles.blockedBannerText}>You blocked this contact.</Text></View> : null}
        <FlatList
          data={messages}
          keyExtractor={(item, index) => item.id || index.toString()}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.messageList}
        />
        <View style={styles.inputRow}>
          <TouchableOpacity onPress={handleAttachment} style={styles.attachButton} disabled={isUploading}>
            {isUploading ? <ActivityIndicator size="small" color="#007AFF" /> : <MaterialIcons name="attach-file" size={28} color="#007AFF" />}
          </TouchableOpacity>
          <TextInput
            value={message}
            onChangeText={handleMessageChange}
            placeholder="Type a message..."
            style={styles.input}
            multiline
            editable={!isUploading && !isBlocked}
          />
          <TouchableOpacity
            onPress={message.trim() ? sendMessage : toggleVoiceRecording}
            style={styles.sendButton}
            disabled={isUploading || isBlocked}
          >
            <MaterialIcons name={recorderState.isRecording ? 'stop' : message.trim() ? 'send' : 'mic'} size={26} color={isUploading ? '#A0A0A0' : recorderState.isRecording ? '#DC2626' : '#007AFF'} />
          </TouchableOpacity>
        </View>
      </View>
      <Modal visible={modalVisible} transparent={true} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.imageModalContainer}>
          <ImageViewer
            imageUrls={[{ url: modalImageUrl }]}
            enableSwipeDown
            onSwipeDown={() => setModalVisible(false)}
          />
          <TouchableOpacity
            style={styles.closeImageButton}
            accessibilityRole="button"
            accessibilityLabel="Close full-screen image"
            onPress={() => setModalVisible(false)}
          >
            <MaterialIcons name="close" size={25} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  chatContainer: {
    flex: 1,
    paddingHorizontal: 8,
    backgroundColor: '#F3F7FF',
  },
  messageList: { paddingTop: 12, paddingBottom: 12 },
  myMessage: { alignItems: 'flex-end', marginVertical: 5, marginHorizontal: 8 },
  otherMessage: { alignItems: 'flex-start', marginVertical: 5, marginHorizontal: 8 },
  textBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    maxWidth: '78%',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  myBubble: {
    backgroundColor: '#2563EB',
    borderBottomRightRadius: 6,
  },
  otherBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#E8ECF5',
  },
  myText: { color: '#FFFFFF', fontSize: 15, lineHeight: 22 },
  otherText: { color: '#1F2937', fontSize: 15, lineHeight: 22 },
  messageTime: { fontSize: 10, marginTop: 5, alignSelf: 'flex-end' },
  myMessageTime: { color: '#DDEBFF' },
  otherMessageTime: { color: '#8A94A3' },
  emojiMessage: { fontSize: 36, lineHeight: 46 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#E1E8F4',
    paddingHorizontal: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    fontSize: 16,
    minHeight: 42,
    maxHeight: 100,
    color: '#111827',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EAF1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F4F7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageAttachment: { width: 180, height: 180, borderRadius: 16 },
  voiceBubble: { flexDirection: 'row', alignItems: 'center', minWidth: 180, padding: 10, borderRadius: 18 },
  voicePlayButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  voiceDetails: { flex: 1, marginLeft: 10 },
  voiceWave: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.38)', overflow: 'hidden' },
  voiceWaveFill: { width: '72%', height: '100%', backgroundColor: 'rgba(255,255,255,0.88)' },
  voiceDuration: { fontSize: 11, marginTop: 5 },
  imageModalContainer: { flex: 1, backgroundColor: '#000000' },
  closeImageButton: {
    position: 'absolute',
    top: 54,
    right: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  documentAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F6FB',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    maxWidth: '80%',
    borderWidth: 1,
    borderColor: '#DDE7F8',
  },
  documentText: { marginLeft: 8, color: '#2563EB', textDecorationLine: 'underline', fontWeight: '600' },
  // Styles for the new header component
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profilePicPlaceholder: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  profilePicText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  headerTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '700',
  },
  typingLabel: { color: '#2563EB', fontSize: 11, fontWeight: '700', marginTop: -2 },
  presenceLabel: { color: '#667085', fontSize: 11, marginTop: -2, maxWidth: 190 },
  blockedBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, marginTop: 8, padding: 9, borderRadius: 10, backgroundColor: '#FEF3F2' },
  blockedBannerText: { color: '#B42318', fontSize: 13, fontWeight: '700' },
  profileImage: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    marginRight: 10,
    backgroundColor: '#E9EEF9',
  },
});
