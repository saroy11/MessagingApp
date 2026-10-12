import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, firestore } from '../firebase';

const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;
const CLOUDINARY_CLOUD_NAME = 'dy6fcosvb';
const CLOUDINARY_UPLOAD_PRESET = 'iChatUpload';

const profileColors = ['#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#16A34A', '#0891B2'];

const getProfileColor = (value) => {
  const text = String(value || 'iChat');
  const hash = text.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
  return profileColors[hash % profileColors.length];
};

const timeAgo = (createdAtMs) => {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - createdAtMs) / 60000));
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  return `${Math.floor(elapsedMinutes / 60)}h ago`;
};

export default function StatusScreen({ route }) {
  const { myPhone, userName } = route.params || {};
  const [statuses, setStatuses] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [composerVisible, setComposerVisible] = useState(false);
  const [viewerStatus, setViewerStatus] = useState(null);
  const [viewersVisible, setViewersVisible] = useState(false);
  const [statusViews, setStatusViews] = useState([]);
  const [caption, setCaption] = useState('');
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const [isPosting, setIsPosting] = useState(false);
  const [replies, setReplies] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const statusProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(firestore, 'statuses'),
      (snapshot) => {
        const fetchedStatuses = snapshot.docs
          .map((statusDoc) => ({ id: statusDoc.id, ...statusDoc.data() }))
          .filter((status) => status.imageUrl || status.text)
          .sort((a, b) => Number(b.createdAtMs) - Number(a.createdAtMs));
        setStatuses(fetchedStatuses);
        setIsLoading(false);
      },
      () => {
        // A status feed may be disabled by Firestore rules. Keep the UI empty
        // in that case, just as it is when no user has posted an update.
        setStatuses([]);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const activeStatuses = useMemo(
    () => statuses.filter((status) => Number(status.expiresAt) > now),
    [now, statuses]
  );

  const myStatus = useMemo(
    () => activeStatuses.find((status) => status.userId === auth.currentUser?.uid) || null,
    [activeStatuses]
  );

  const otherStatuses = useMemo(
    () => activeStatuses.filter((status) => status.userId !== auth.currentUser?.uid),
    [activeStatuses]
  );

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return undefined;

    return onSnapshot(
      collection(firestore, 'statuses', user.uid, 'views'),
      (snapshot) => {
        setStatusViews(snapshot.docs.map((viewDoc) => ({ id: viewDoc.id, ...viewDoc.data() })));
      },
      () => setStatusViews([])
    );
  }, []);

  const currentStatusViews = useMemo(
    () => statusViews
      .filter((view) => view.statusCreatedAtMs === myStatus?.createdAtMs)
      .sort((a, b) => Number(b.viewedAtMs) - Number(a.viewedAtMs)),
    [myStatus?.createdAtMs, statusViews]
  );

  useEffect(() => {
    if (!viewerStatus || viewerStatus.userId !== auth.currentUser?.uid) {
      setReplies([]);
      return undefined;
    }

    return onSnapshot(
      collection(firestore, 'statuses', viewerStatus.id, 'replies'),
      (snapshot) => {
        setReplies(snapshot.docs
          .map((replyDoc) => ({ id: replyDoc.id, ...replyDoc.data() }))
          .filter((reply) => reply.statusCreatedAtMs === viewerStatus.createdAtMs)
          .sort((a, b) => Number(a.createdAtMs) - Number(b.createdAtMs)));
      },
      () => setReplies([])
    );
  }, [viewerStatus]);

  useEffect(() => {
    if (!viewerStatus) return undefined;
    statusProgress.setValue(0);
    const animation = Animated.timing(statusProgress, {
      toValue: 1,
      duration: 5000,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) setViewerStatus(null);
    });
    return () => animation.stop();
  }, [statusProgress, viewerStatus]);

  const openComposer = () => {
    if (myStatus) return;
    setCaption('');
    setSelectedImageUri(null);
    setComposerVisible(true);
  };

  const postStatus = async () => {
    const trimmedCaption = caption.trim();
    const user = auth.currentUser;
    if (!selectedImageUri) {
      Alert.alert('Add a photo', 'Choose a photo for your status first.');
      return;
    }
    if (!user) {
      Alert.alert('Not signed in', 'Please sign in again to post a status.');
      return;
    }

    setIsPosting(true);
    try {
      const createdAtMs = Date.now();
      const imageUrl = await uploadStatusImage(selectedImageUri);
      // A status is immutable after posting. Remove an expired document before
      // creating the next one, rather than updating the old status in place.
      await deleteDoc(doc(firestore, 'statuses', user.uid));
      await setDoc(doc(firestore, 'statuses', user.uid), {
        userId: user.uid,
        name: userName || user.displayName || 'iChat user',
        phone: myPhone || '',
        imageUrl,
        caption: trimmedCaption,
        createdAtMs,
        expiresAt: createdAtMs + STATUS_LIFETIME_MS,
        createdAt: serverTimestamp(),
      });
      setComposerVisible(false);
      setCaption('');
      setSelectedImageUri(null);
    } catch (error) {
      console.error('Unable to post status:', error);
      Alert.alert('Could not post status', error.message || 'Please try again.');
    } finally {
      setIsPosting(false);
    }
  };

  const pickStatusImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to post a photo status.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setSelectedImageUri(result.assets[0].uri);
  };

  const uploadStatusImage = async (imageUri) => {
    const formData = new FormData();
    formData.append('file', { uri: imageUri, type: 'image/jpeg', name: `status_${Date.now()}.jpg` });
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();
    if (!result.secure_url) throw new Error('Photo upload failed. Please try again.');
    return result.secure_url;
  };

  const deleteMyStatus = () => {
    Alert.alert('Delete status?', 'This status will no longer be visible.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(firestore, 'statuses', auth.currentUser.uid));
            setViewerStatus(null);
            setViewersVisible(false);
          } catch (error) {
            Alert.alert('Could not delete status', error.message || 'Please try again.');
          }
        },
      },
    ]);
  };

  const sendReply = async () => {
    const text = replyText.trim();
    const user = auth.currentUser;
    if (!text || !viewerStatus || !user || viewerStatus.userId === user.uid) return;
    setIsReplying(true);
    try {
      const viewedAtMs = Date.now();
      await setDoc(doc(collection(firestore, 'statuses', viewerStatus.id, 'replies')), {
        senderId: user.uid,
        senderName: userName || user.displayName || 'iChat user',
        text,
        statusCreatedAtMs: viewerStatus.createdAtMs,
        createdAtMs: viewedAtMs,
        createdAt: serverTimestamp(),
      });
      setReplyText('');
    } catch (error) {
      Alert.alert('Could not send reply', error.message || 'Please try again.');
    } finally {
      setIsReplying(false);
    }
  };

  const openStatus = async (status) => {
    setViewerStatus(status);
    const user = auth.currentUser;
    if (!user || status.userId === user.uid) return;

    try {
      await setDoc(doc(firestore, 'statuses', status.id, 'views', user.uid), {
        viewerId: user.uid,
        viewerName: userName || user.displayName || 'iChat user',
        statusCreatedAtMs: status.createdAtMs,
        viewedAtMs: Date.now(),
        viewedAt: serverTimestamp(),
      });
    } catch (error) {
      // Viewing a status remains available if a project's rules do not yet
      // allow view tracking.
      console.warn('Unable to record status view:', error.code);
    }
  };

  const renderStatus = ({ item }) => (
    <TouchableOpacity style={styles.statusRow} onPress={() => openStatus(item)} activeOpacity={0.75}>
      <View style={[styles.avatarRing, { borderColor: getProfileColor(item.userId) }]}>
        <View style={[styles.avatar, { backgroundColor: getProfileColor(item.userId) }]}>
          <Text style={styles.avatarText}>{item.name?.charAt(0)?.toUpperCase() || '?'}</Text>
        </View>
      </View>
      <View style={styles.statusInfo}>
        <Text style={styles.statusName}>{item.name || 'iChat user'}</Text>
        <Text style={styles.statusPreview} numberOfLines={1}>{item.caption || item.text || 'Photo status'}</Text>
        <Text style={styles.statusTime}>{timeAgo(Number(item.createdAtMs))}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.myStatusCard} onPress={() => myStatus ? openStatus(myStatus) : openComposer()} activeOpacity={0.82}>
        <View style={[styles.avatar, styles.myAvatar, { backgroundColor: getProfileColor(auth.currentUser?.uid) }]}>
          {myStatus?.imageUrl ? <Image source={{ uri: myStatus.imageUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{userName?.charAt(0)?.toUpperCase() || 'Y'}</Text>}
          {!myStatus ? <View style={styles.addBadge}><MaterialIcons name="add" size={16} color="#FFFFFF" /></View> : null}
        </View>
        <View style={styles.statusInfo}>
          <Text style={styles.statusName}>My status</Text>
          <Text style={styles.myStatusPreview} numberOfLines={1}>
            {myStatus ? `${myStatus.caption || myStatus.text || 'Photo status'} · ${timeAgo(Number(myStatus.createdAtMs))}` : 'Tap to add a photo status'}
          </Text>
        </View>
        {myStatus ? (
          <TouchableOpacity style={styles.viewCountButton} onPress={() => setViewersVisible(true)}>
            <MaterialIcons name="visibility" size={18} color="#2563EB" />
            <Text style={styles.viewCount}>{currentStatusViews.length}</Text>
          </TouchableOpacity>
        ) : <MaterialIcons name="chevron-right" size={24} color="#98A2B3" />}
      </TouchableOpacity>

      <FlatList
        data={otherStatuses}
        keyExtractor={(item) => item.id}
        renderItem={renderStatus}
        contentContainerStyle={otherStatuses.length ? styles.listContent : styles.emptyListContent}
        ListHeaderComponent={otherStatuses.length ? <Text style={styles.sectionTitle}>RECENT UPDATES</Text> : null}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {isLoading ? <ActivityIndicator color="#2563EB" /> : <MaterialIcons name="history" size={42} color="#2563EB" />}
            <Text style={styles.emptyTitle}>{isLoading ? 'Loading updates' : 'No recent updates'}</Text>
            <Text style={styles.emptyText}>{isLoading ? 'Getting the latest statuses.' : 'Updates from people on iChat will appear here for 24 hours.'}</Text>
          </View>
        }
      />

      <Modal visible={composerVisible} animationType="slide" transparent onRequestClose={() => setComposerVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.composerCard}>
            <View style={styles.composerHeader}>
              <Text style={styles.composerTitle}>Add photo status</Text>
              <TouchableOpacity onPress={() => setComposerVisible(false)} hitSlop={12}>
                <MaterialIcons name="close" size={24} color="#475467" />
              </TouchableOpacity>
            </View>
            <Text style={styles.composerHint}>Choose a photo and add an optional caption. Once posted, it can only be deleted.</Text>
            <TouchableOpacity style={styles.photoPicker} onPress={pickStatusImage}>
              {selectedImageUri ? (
                <Image source={{ uri: selectedImageUri }} style={styles.selectedImage} />
              ) : (
                <><MaterialIcons name="add-photo-alternate" size={32} color="#2563EB" /><Text style={styles.photoPickerText}>Choose photo</Text></>
              )}
            </TouchableOpacity>
            <TextInput
              style={styles.composerInput}
              value={caption}
              onChangeText={setCaption}
              placeholder="Add a caption (optional)"
              placeholderTextColor="#98A2B3"
              multiline
              maxLength={500}
              autoFocus
            />
            <TouchableOpacity style={[styles.postButton, isPosting && styles.postButtonDisabled]} onPress={postStatus} disabled={isPosting}>
              {isPosting ? <ActivityIndicator color="#FFFFFF" /> : <><MaterialIcons name="send" size={18} color="#FFFFFF" /><Text style={styles.postButtonText}>Post status</Text></>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(viewerStatus)} animationType="fade" onRequestClose={() => setViewerStatus(null)}>
        <View style={[styles.fullscreenViewer, { backgroundColor: getProfileColor(viewerStatus?.userId) }]}>
          {viewerStatus?.imageUrl ? <Image source={{ uri: viewerStatus.imageUrl }} style={styles.statusImage} /> : null}
          <View style={styles.viewerProgressTrack}>
            <Animated.View style={[styles.viewerProgressFill, {
              width: statusProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }]} />
          </View>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerStatus(null)} hitSlop={12}>
            <MaterialIcons name="close" size={25} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.viewerName}>{viewerStatus?.name || 'iChat user'}</Text>
          <Text style={styles.viewerTime}>{viewerStatus ? timeAgo(Number(viewerStatus.createdAtMs)) : ''}</Text>
          <Text style={styles.viewerText}>{viewerStatus?.caption || viewerStatus?.text}</Text>
          {viewerStatus?.userId === auth.currentUser?.uid ? (
            <>
              <TouchableOpacity style={styles.deleteButton} onPress={deleteMyStatus}>
                <MaterialIcons name="delete-outline" size={19} color="#FFFFFF" />
                <Text style={styles.deleteButtonText}>Delete status</Text>
              </TouchableOpacity>
              {replies.length ? <Text style={styles.replyTitle}>Replies</Text> : null}
              {replies.map((reply) => <View key={reply.id} style={styles.replyBubble}><Text style={styles.replyName}>{reply.senderName || 'iChat user'}</Text><Text style={styles.replyText}>{reply.text}</Text></View>)}
            </>
          ) : (
            <View style={styles.replyComposer}>
              <TextInput
                style={styles.replyInput}
                value={replyText}
                onChangeText={setReplyText}
                placeholder="Reply to status"
                placeholderTextColor="rgba(255,255,255,0.7)"
                maxLength={500}
              />
              <TouchableOpacity onPress={sendReply} disabled={isReplying || !replyText.trim()} style={styles.replySend}>
                {isReplying ? <ActivityIndicator color="#FFFFFF" size="small" /> : <MaterialIcons name="send" size={21} color="#FFFFFF" />}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={viewersVisible} animationType="slide" transparent onRequestClose={() => setViewersVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.viewersCard}>
            <View style={styles.composerHeader}>
              <View>
                <Text style={styles.composerTitle}>Viewed by</Text>
                <Text style={styles.composerHint}>{currentStatusViews.length} {currentStatusViews.length === 1 ? 'view' : 'views'}</Text>
              </View>
              <TouchableOpacity onPress={() => setViewersVisible(false)} hitSlop={12}>
                <MaterialIcons name="close" size={24} color="#475467" />
              </TouchableOpacity>
            </View>
            {currentStatusViews.length ? currentStatusViews.map((view) => (
              <View style={styles.viewerRow} key={view.id}>
                <View style={[styles.smallAvatar, { backgroundColor: getProfileColor(view.viewerId) }]}>
                  <Text style={styles.smallAvatarText}>{view.viewerName?.charAt(0)?.toUpperCase() || '?'}</Text>
                </View>
                <View>
                  <Text style={styles.statusName}>{view.viewerName || 'iChat user'}</Text>
                  <Text style={styles.statusTime}>{timeAgo(Number(view.viewedAtMs))}</Text>
                </View>
              </View>
            )) : (
              <View style={styles.noViews}><MaterialIcons name="visibility-off" size={28} color="#98A2B3" /><Text style={styles.emptyText}>No one has viewed this status yet.</Text></View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F8FC' },
  myStatusCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', margin: 16, marginBottom: 6, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: '#E7ECF6' },
  avatarRing: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, padding: 3, marginRight: 13 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  myAvatar: { marginRight: 13 },
  avatarText: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  addBadge: { position: 'absolute', right: -3, bottom: -2, width: 21, height: 21, borderRadius: 11, backgroundColor: '#2563EB', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  statusInfo: { flex: 1 },
  statusName: { color: '#1F2937', fontSize: 16, fontWeight: '700' },
  statusPreview: { color: '#475467', marginTop: 3, fontSize: 14 },
  myStatusPreview: { color: '#667085', marginTop: 3, fontSize: 14 },
  viewCountButton: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 8 },
  viewCount: { color: '#2563EB', fontSize: 14, fontWeight: '800' },
  statusTime: { color: '#98A2B3', fontSize: 12, marginTop: 3 },
  listContent: { paddingBottom: 20 },
  emptyListContent: { flexGrow: 1 },
  sectionTitle: { color: '#7D8796', fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginLeft: 22, marginTop: 14, marginBottom: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#EDF0F5' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 46, paddingBottom: 70 },
  emptyTitle: { color: '#1F2937', fontWeight: '700', fontSize: 19, marginTop: 15, marginBottom: 7 },
  emptyText: { color: '#667085', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.38)' },
  composerCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 34 },
  viewersCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 34, minHeight: 240 },
  composerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  composerTitle: { color: '#111827', fontSize: 20, fontWeight: '800' },
  composerHint: { color: '#667085', fontSize: 14, marginTop: 5, marginBottom: 16 },
  photoPicker: { height: 180, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#93C5FD', backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 8 },
  photoPickerText: { color: '#2563EB', fontWeight: '700', fontSize: 15 },
  selectedImage: { width: '100%', height: '100%' },
  composerInput: { minHeight: 130, maxHeight: 220, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, padding: 14, textAlignVertical: 'top', color: '#111827', fontSize: 16 },
  postButton: { height: 50, marginTop: 14, borderRadius: 14, backgroundColor: '#2563EB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  postButtonDisabled: { opacity: 0.7 },
  postButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  fullscreenViewer: { flex: 1, padding: 28, paddingTop: 66, justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  statusImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined, opacity: 0.48 },
  viewerProgressTrack: { position: 'absolute', top: 24, left: 20, right: 20, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  viewerProgressFill: { height: 3, borderRadius: 2, backgroundColor: '#FFFFFF' },
  viewerClose: { position: 'absolute', top: 38, right: 22 },
  viewerName: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginBottom: 5 },
  viewerTime: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  viewerText: { color: '#FFFFFF', fontSize: 27, lineHeight: 37, fontWeight: '700', marginTop: 30, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  deleteButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 24, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.28)' },
  deleteButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  replyTitle: { color: '#FFFFFF', fontWeight: '800', marginTop: 22, marginBottom: 7, fontSize: 15 },
  replyBubble: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 12, padding: 10, marginTop: 6 },
  replyName: { color: '#2563EB', fontWeight: '800', fontSize: 12, marginBottom: 2 },
  replyText: { color: '#1F2937', fontSize: 14 },
  replyComposer: { position: 'absolute', left: 28, right: 28, bottom: 36, flexDirection: 'row', alignItems: 'center', borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.2)', paddingLeft: 13 },
  replyInput: { flex: 1, color: '#FFFFFF', fontSize: 15, paddingVertical: 12 },
  replySend: { width: 45, height: 45, alignItems: 'center', justifyContent: 'center' },
  viewerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  smallAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  smallAvatarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  noViews: { alignItems: 'center', paddingVertical: 34, gap: 10 },
});
