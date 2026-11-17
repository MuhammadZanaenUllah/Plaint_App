import UserNotifications

/// Rewrites incoming chat pushes so one notification per conversation shows
/// "N new messages". The backend sends chat pushes with mutable-content (so this
/// runs), thread-id = room_id (stacking) and collapse-id = room_id (each new
/// message replaces the conversation's previous notification).
///
/// The running count is stored on the delivered notification itself
/// (`planit_count`), so there is no shared state to keep in sync: when the app
/// dismisses a read conversation's notification, the next message starts at 1.
class NotificationService: UNNotificationServiceExtension {
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttempt: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    guard
      let content = request.content.mutableCopy() as? UNMutableNotificationContent,
      let roomId = Self.chatRoomId(content.userInfo)
    else {
      contentHandler(request.content)
      return
    }
    self.contentHandler = contentHandler
    bestAttempt = content

    UNUserNotificationCenter.current().getDeliveredNotifications { delivered in
      let previous = delivered
        .filter { Self.chatRoomId($0.request.content.userInfo) == roomId }
        .compactMap { $0.request.content.userInfo["planit_count"] as? Int }
        .max() ?? 0
      let count = previous + 1
      content.userInfo["planit_count"] = count
      content.threadIdentifier = roomId
      if count > 1 {
        content.body = "\(count) new messages"
      }
      contentHandler(content)
    }
  }

  override func serviceExtensionTimeWillExpire() {
    // Out of time: show the push as it arrived.
    if let contentHandler, let bestAttempt {
      contentHandler(bestAttempt)
    }
  }

  /// Expo puts the push `data` object under userInfo["body"].
  private static func chatRoomId(_ userInfo: [AnyHashable: Any]) -> String? {
    guard
      let data = userInfo["body"] as? [String: Any],
      data["type"] as? String == "chat",
      let roomId = data["room_id"]
    else { return nil }
    return "\(roomId)"
  }
}
