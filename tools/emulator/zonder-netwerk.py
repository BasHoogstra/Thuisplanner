#!/usr/bin/env python3
# Draait een opdracht in een eigen, lege netwerknamespace (aangeroepen via `unshare -rn`).
# Alleen loopback wordt aangezet; er is geen route naar buiten. Zo zijn de proef én de
# emulator-JVM technisch van het netwerk afgesloten (besluit 9.4), niet alleen via de allowlist.
# Gebruik: unshare -rn python3 -I tools/emulator/zonder-netwerk.py <opdracht> [args...]
import fcntl
import os
import socket
import struct
import sys

SIOCGIFFLAGS, SIOCSIFFLAGS, IFF_UP = 0x8913, 0x8914, 0x1
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
ifr = struct.pack('16sH14s', b'lo', 0, b'\0' * 14)
flags = struct.unpack('16sH14s', fcntl.ioctl(s, SIOCGIFFLAGS, ifr))[1]
fcntl.ioctl(s, SIOCSIFFLAGS, struct.pack('16sH14s', b'lo', flags | IFF_UP, b'\0' * 14))
s.close()
os.environ['P13_NETNS'] = '1'
os.execvp(sys.argv[1], sys.argv[1:])
