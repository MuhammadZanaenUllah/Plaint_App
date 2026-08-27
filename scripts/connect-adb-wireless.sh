#!/usr/bin/env bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}    ADB Wireless Connector Script         ${NC}"
echo -e "${BLUE}==========================================${NC}"

# Check ADB
if ! command -v adb &> /dev/null; then
    echo -e "${RED}Error: 'adb' command not found. Make sure Android SDK platform-tools are in your PATH.${NC}"
    exit 1
fi

# Check if already connected wirelessly
WIRELESS_DEVICE=$(adb devices | awk 'NR>1 && $2=="device" && $1 ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/ {print $1; exit}')

if [ -n "$WIRELESS_DEVICE" ]; then
    echo -e "${GREEN}Already connected wirelessly to $WIRELESS_DEVICE!${NC}\n"
    adb devices
    exit 0
fi

# Target device serial if passed as argument 1, or auto-detect USB device
TARGET_SERIAL="${1}"

if [ -z "$TARGET_SERIAL" ]; then
    TARGET_SERIAL=$(adb devices | awk 'NR>1 && $2=="device" && $1 !~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/ {print $1; exit}')
fi

if [ -z "$TARGET_SERIAL" ]; then
    TARGET_SERIAL=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
fi

if [ -z "$TARGET_SERIAL" ]; then
    echo -e "${RED}No attached Android devices found. Please connect your phone via USB and ensure USB Debugging is enabled.${NC}"
    exit 1
fi

echo -e "${YELLOW}Target Device Serial:${NC} $TARGET_SERIAL"

# Extract IP address from wlan0 interface
DEVICE_IP=$(adb -s "$TARGET_SERIAL" shell "ip addr | grep -E 'inet .*wlan0'" 2>/dev/null | awk '{print $2}' | cut -d'/' -f1 | head -n 1)

# Fallback: check any non-loopback inet IP
if [ -z "$DEVICE_IP" ]; then
    DEVICE_IP=$(adb -s "$TARGET_SERIAL" shell "ip addr | grep -E 'inet '" 2>/dev/null | awk '{print $2}' | cut -d'/' -f1 | grep -v '127.0.0.1' | head -n 1)
fi

if [ -z "$DEVICE_IP" ]; then
    echo -e "${RED}Could not automatically determine the device Wi-Fi IP address. Make sure the phone is connected to Wi-Fi.${NC}"
    exit 1
fi

echo -e "${GREEN}Found Device Wi-Fi IP:${NC} $DEVICE_IP"

# Enable TCP/IP mode on port 5555 (ignore socket close notification during adbd restart)
echo -e "${YELLOW}Restarting ADB daemon in TCP mode on port 5555...${NC}"
adb -s "$TARGET_SERIAL" tcpip 5555 >/dev/null 2>&1 || true
sleep 3

# Connect wirelessly
echo -e "${YELLOW}Connecting to $DEVICE_IP:5555...${NC}"
adb connect "$DEVICE_IP:5555"

echo -e "\n${GREEN}==========================================${NC}"
echo -e "${GREEN}        Connected Devices List            ${NC}"
echo -e "${GREEN}==========================================${NC}"
adb devices

echo -e "\n${GREEN}Success! You can now safely unplug your USB cable.${NC}"
