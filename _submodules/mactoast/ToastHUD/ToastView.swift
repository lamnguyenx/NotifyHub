import SwiftUI
import AppKit

struct ToastView: View {
    let message: String
    let fontSize: CGFloat
    let backgroundColor: NSColor
    let textColor: NSColor
    let cornerRadius: CGFloat
    let width: CGFloat
    let height: CGFloat
    let icon: String?  // SF Symbol name
    let iconText: String?  // Text to render as avatar
    let iconBg: String?  // Hex color for avatar background
    let clickToDismiss: Bool
    var onTap: (() -> Void)?  // Click-to-dismiss callback

    var body: some View {
        ZStack {
            VisualEffectView(material: .hudWindow, blendingMode: .behindWindow)
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))

            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(Color(nsColor: backgroundColor))

            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(Color.white.opacity(0.15), lineWidth: 2)

            HStack(alignment: .top, spacing: 10) {
                if let iconText = iconText, !iconText.isEmpty {
                    avatarView(text: iconText)
                } else if let iconName = icon, !iconName.isEmpty {
                    Image(systemName: iconName)
                        .font(.system(size: fontSize + 4, weight: .semibold))
                        .foregroundStyle(Color(nsColor: textColor))
                }

                Text(message)
                    .font(.system(size: fontSize, weight: .medium))
                    .foregroundStyle(Color(nsColor: textColor))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 0)
            }
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(width: width, height: height)
        .contentShape(Rectangle())
        .onTapGesture {
            if clickToDismiss {
                onTap?()
            }
        }
    }

    @ViewBuilder
    private func avatarView(text: String) -> some View {
        let iconSize: CGFloat = 28
        let showText = String(text.prefix(3)).uppercased()
        let avatarColor = iconBgColor()

        RoundedRectangle(cornerRadius: 6, style: .continuous)
            .fill(avatarColor)
            .frame(width: iconSize, height: iconSize)
            .overlay(
                Text(showText)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
            )
    }

    private func iconBgColor() -> Color {
        guard let hex = iconBg else {
            return Color.white.opacity(0.2)
        }
        if let nsColor = NSColor.fromHexString(hex) {
            return Color(nsColor: nsColor)
        }
        return Color.white.opacity(0.2)
    }
}
