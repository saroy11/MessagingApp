import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { addDoc, collection, getDocs, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
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
import { firestore } from '../firebase';

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
  // Remove '+91' prefix and any other non-digit characters
  return String(phone).replace(/^\+91/, '').replace(/[^0-9]/g, '');
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

export default function ChatPage({ route, navigation }) {
  const { userId, name, myPhone } = route.params;
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState('');
  const [profilePicUrl, setProfilePicUrl] = useState(null);

  const CLOUDINARY_UPLOAD_PRESET = 'iChatUpload';
  const CLOUDINARY_CLOUD_NAME = 'dy6fcosvb';

  // Fetch the user's profile picture by phone number
  useEffect(() => {
    const fetchProfilePic = async () => {
      // Use a query to find the user document by phone number
      const usersQuery = query(collection(firestore, 'users'), where('phone', '==', Number(userId)));
      const usersSnapshot = await getDocs(usersQuery);
      if (!usersSnapshot.empty) {
        const userData = usersSnapshot.docs[0].data();
        setProfilePicUrl(userData.profilePic || null);
      }
    };
    fetchProfilePic();
  }, [userId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: () => (
        <View style={styles.headerTitleContainer}>
          {profilePicUrl ? (
            <Image source={{ uri: profilePicUrl }} style={styles.profileImage} />
          ) : (
            <View style={[styles.profilePicPlaceholder, { backgroundColor: getRandomColor(userId) }]}>
              <Text style={styles.profilePicText}>
                {name && typeof name === 'string' ? name.charAt(0).toUpperCase() : ''}
              </Text>
            </View>
          )}
          <Text style={styles.headerTitle}>{name || 'Chat'}</Text>
        </View>
      ),
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 16 }}>
          <MaterialIcons name="arrow-back" size={28} color="#007AFF" />
        </TouchableOpacity>
      ),
      headerStyle: {
        backgroundColor: 'white',
      },
    });
  }, [navigation, userId, name, profilePicUrl]);

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
      if (DocumentPicker.requestDocumentPermissionsAsync) {
        const { status } = await DocumentPicker.requestDocumentPermissionsAsync();
        if (status !== 'granted') {
          alert('Permission to access documents is required!');
          setIsUploading(false);
          return;
        }
      }
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

  const uploadAndSendAttachment = async (uri, type, fileName, mimeType = null) => {
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
        chatWith: normalizePhone(userId),
        text: '',
        attachmentUrl: data.secure_url,
        attachmentType: type,
        fileName: fileName || null,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      alert('Failed to send attachment: ' + (err.message || err));
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (!myPhone || !userId) return;
    const normalizedMyPhone = normalizePhone(myPhone);
    const normalizedUserId = normalizePhone(userId);

    const messagesQuery = query(collection(firestore, 'messages'));

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const data = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter(
          (msg) =>
            (normalizePhone(msg.from) === normalizedMyPhone && normalizePhone(msg.chatWith) === normalizedUserId) ||
            (normalizePhone(msg.from) === normalizedUserId && normalizePhone(msg.chatWith) === normalizedMyPhone)
        )
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMessages(data);
    });
    return () => unsubscribe();
  }, [myPhone, userId]);

  const sendMessage = async () => {
    if (!myPhone || !userId || message.trim().length === 0) return;
    await addDoc(collection(firestore, 'messages'), {
      from: normalizePhone(myPhone),
      chatWith: normalizePhone(userId),
      text: message,
      createdAt: serverTimestamp(),
    });
    setMessage('');
  };

  const renderMessage = ({ item }) => {
    const isMe = normalizePhone(item.from) === normalizePhone(myPhone);
    const messageStyle = [isMe ? styles.myMessage : styles.otherMessage];
    const textStyle = isMe ? styles.myText : styles.otherText;

    return (
      <View style={messageStyle}>
        {!item.attachmentUrl ? (
          <View style={[styles.textBubble, isMe ? styles.myBubble : styles.otherBubble]}>
            <Text style={textStyle}>{item.text}</Text>
          </View>
        ) : item.attachmentType === 'image' ? (
          <TouchableOpacity onPress={() => { setModalImageUrl(item.attachmentUrl); setModalVisible(true); }}>
            <Image source={{ uri: item.attachmentUrl }} style={styles.imageAttachment} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => Linking.openURL(item.attachmentUrl)} style={styles.documentAttachment}>
            <MaterialIcons name="insert-drive-file" size={24} color="#007AFF" />
            <Text style={styles.documentText}>{item.fileName || 'Document'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
      <View style={{ flex: 1, padding: 16 }}>
        <FlatList
          data={messages}
          keyExtractor={(item, index) => item.id || index.toString()}
          renderItem={renderMessage}
          inverted
        />
        <View style={styles.inputRow}>
          <TouchableOpacity onPress={handleAttachment} style={styles.attachButton} disabled={isUploading}>
            {isUploading ? <ActivityIndicator size="small" color="#007AFF" /> : <MaterialIcons name="attach-file" size={28} color="#007AFF" />}
          </TouchableOpacity>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Type a message..."
            style={styles.input}
            multiline
            editable={!isUploading}
          />
          <TouchableOpacity
            onPress={sendMessage}
            style={styles.sendButton}
            disabled={isUploading}
          >
            <MaterialIcons name="send" size={28} color={isUploading ? '#A0A0A0' : '#007AFF'} />
          </TouchableOpacity>
        </View>
      </View>
      <Modal visible={modalVisible} transparent={true} onRequestClose={() => setModalVisible(false)}>
        <ImageViewer
          imageUrls={[{ url: modalImageUrl }]}
          enableSwipeDown
          onSwipeDown={() => setModalVisible(false)}
        />
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  myMessage: { alignItems: 'flex-end', marginVertical: 4, marginHorizontal: 8 },
  otherMessage: { alignItems: 'flex-start', marginVertical: 4, marginHorizontal: 8 },
  textBubble: { padding: 10, borderRadius: 16, maxWidth: '80%' },
  myBubble: { backgroundColor: '#007AFF', borderTopRightRadius: 0 },
  otherBubble: { backgroundColor: '#E5E5EA', borderTopLeftRadius: 0 },
  myText: { color: 'white' },
  otherText: { color: 'black' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#ccc',
    paddingHorizontal: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 24,
    fontSize: 16,
    minHeight: 40,
    maxHeight: 100,
  },
  sendButton: { padding: 8 },
  attachButton: { padding: 8 },
  imageAttachment: { width: 180, height: 180, borderRadius: 12 },
  documentAttachment: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', padding: 8, borderRadius: 8, maxWidth: '80%' },
  documentText: { marginLeft: 6, color: '#007AFF', textDecorationLine: 'underline' },
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
    fontWeight: 'bold',
  },
  headerTitle: {
    color: 'black',
    fontSize: 20,
    fontWeight: 'bold',
  },
  profileImage: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    marginRight: 10,
    backgroundColor: '#f0f0f0',
  },
});