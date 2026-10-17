import QtQuick
import QtQuick.Shapes

Item {
    id: root

    property color centerColor: "#A969F4"
    property color outerColor: "#FAF9F6"
    property int pulseSpeedMs: 2800
    property bool isListening: false
    property bool isSpeaking: false
    property bool isWorking: false

    implicitWidth: 330
    implicitHeight: 330

    readonly property real centerX: width / 2
    readonly property real centerY: height / 2

    // Bakgrunnsaura: fyldig lilla senter med myk uttoning
    Item {
        id: auraContainer
        anchors.fill: parent

        // Beroligende puste-animasjon
        SequentialAnimation on scale {
            loops: Animation.Infinite
            running: true
            NumberAnimation {
                from: 0.98
                to: root.isListening ? 1.06 : 1.03
                duration: root.pulseSpeedMs / 2
                easing.type: Easing.InOutSine
            }
            NumberAnimation {
                from: root.isListening ? 1.06 : 1.03
                to: 0.98
                duration: root.pulseSpeedMs / 2
                easing.type: Easing.InOutSine
            }
        }

        SequentialAnimation on opacity {
            loops: Animation.Infinite
            running: true
            NumberAnimation {
                from: 0.94
                to: 1.0
                duration: root.pulseSpeedMs / 2
                easing.type: Easing.InOutSine
            }
            NumberAnimation {
                from: 1.0
                to: 0.94
                duration: root.pulseSpeedMs / 2
                easing.type: Easing.InOutSine
            }
        }

        Shape {
            anchors.fill: parent
            asynchronous: true

            ShapePath {
                strokeColor: "transparent"
                fillGradient: RadialGradient {
                    centerX: auraContainer.width / 2
                    centerY: auraContainer.height / 2
                    centerRadius: Math.min(auraContainer.width, auraContainer.height) / 2
                    focalX: auraContainer.width / 2
                    focalY: auraContainer.height / 2

                    GradientStop {
                        position: 0.0
                        color: root.centerColor
                        Behavior on color { ColorAnimation { duration: 400 } }
                    }
                    GradientStop {
                        position: 0.55
                        color: Qt.rgba(
                            Math.min(1.0, root.centerColor.r * 1.06),
                            Math.min(1.0, root.centerColor.g * 1.22),
                            root.centerColor.b,
                            0.94
                        )
                    }
                    GradientStop {
                        position: 0.68
                        color: Qt.rgba(root.centerColor.r, root.centerColor.g, root.centerColor.b, 0.72)
                    }
                    GradientStop {
                        position: 0.80
                        color: Qt.rgba(root.centerColor.r, root.centerColor.g, root.centerColor.b, 0.36)
                    }
                    GradientStop {
                        position: 0.90
                        color: Qt.rgba(root.centerColor.r, root.centerColor.g, root.centerColor.b, 0.10)
                    }
                    GradientStop {
                        position: 0.98
                        color: "transparent"
                    }
                }

                startX: 0
                startY: 0
                PathRectangle {
                    x: 0
                    y: 0
                    width: auraContainer.width
                    height: auraContainer.height
                }
            }
        }
    }

    // Josefines ansikt: store runde øyne med lysglimt, mykt smil og lys stjerne
    Item {
        id: faceContainer
        anchors.fill: parent
        transformOrigin: Item.Center

        // Venstre øye (40x40 med lysrefleks oppe til høyre)
        Rectangle {
            id: leftEye
            width: 40
            height: 40
            radius: 20
            color: "#171719"
            x: root.centerX - 70
            y: root.centerY - 28
            transformOrigin: Item.Center

            scale: root.isListening ? 1.10 : 1.0
            Behavior on scale { NumberAnimation { duration: 200 } }

            Rectangle {
                width: 14
                height: 14
                radius: 7
                color: "#C7C7E5"
                x: 20
                y: 6
            }
        }

        // Høyre øye (40x40 med lysrefleks oppe til høyre)
        Rectangle {
            id: rightEye
            width: 40
            height: 40
            radius: 20
            color: "#171719"
            x: root.centerX + 30
            y: root.centerY - 28
            transformOrigin: Item.Center

            scale: root.isListening ? 1.10 : 1.0
            Behavior on scale { NumberAnimation { duration: 200 } }

            Rectangle {
                width: 14
                height: 14
                radius: 7
                color: "#C7C7E5"
                x: 20
                y: 6
            }
        }

        // Blinke-animasjon for øynene
        SequentialAnimation {
            id: blinkAnimation
            running: false

            ParallelAnimation {
                NumberAnimation { target: leftEye; property: "scale"; to: 0.08; duration: 80; easing.type: Easing.InQuad }
                NumberAnimation { target: rightEye; property: "scale"; to: 0.08; duration: 80; easing.type: Easing.InQuad }
            }
            ParallelAnimation {
                NumberAnimation { target: leftEye; property: "scale"; to: root.isListening ? 1.10 : 1.0; duration: 100; easing.type: Easing.OutQuad }
                NumberAnimation { target: rightEye; property: "scale"; to: root.isListening ? 1.10 : 1.0; duration: 100; easing.type: Easing.OutQuad }
            }
        }

        Timer {
            interval: 4500
            running: true
            repeat: true
            onTriggered: {
                if (!root.isSpeaking) {
                    blinkAnimation.start();
                }
            }
        }

        // Smil (myk U-bue sentrert mellom øynene)
        Shape {
            id: mouth
            width: 22
            height: 16
            x: root.centerX - 11
            y: root.centerY + 20
            transformOrigin: Item.Center

            ShapePath {
                strokeColor: "#171719"
                strokeWidth: 3.6
                fillColor: "transparent"
                capStyle: ShapePath.RoundCap
                joinStyle: ShapePath.RoundJoin

                startX: 2
                startY: 2
                PathQuad {
                    x: 20
                    y: 2
                    controlX: 11
                    controlY: root.isSpeaking ? 18 : 14
                }
            }

            // Snakke-animasjon
            SequentialAnimation on scale {
                running: root.isSpeaking
                loops: Animation.Infinite
                NumberAnimation { from: 1.0; to: 1.25; duration: 180 }
                NumberAnimation { from: 1.25; to: 0.95; duration: 180 }
            }
        }

        // Magisk 4-tagget lys stjerne (✦) oppe til høyre over høyre øye
        Item {
            id: sparkle
            x: root.centerX + 56
            y: root.centerY - 64
            width: 26
            height: 26
            transformOrigin: Item.Center

            Shape {
                anchors.fill: parent
                ShapePath {
                    fillColor: "#E3D3F5"
                    strokeColor: "transparent"
                    strokeWidth: 0
                    startX: 13
                    startY: 0
                    PathQuad { x: 26; y: 13; controlX: 13; controlY: 13 }
                    PathQuad { x: 13; y: 26; controlX: 13; controlY: 13 }
                    PathQuad { x: 0;  y: 13; controlX: 13; controlY: 13 }
                    PathQuad { x: 13; y: 0;  controlX: 13; controlY: 13 }
                }
            }

            // Subtil glitre-animasjon (raskere når Arbeidsmauren jobber)
            SequentialAnimation on scale {
                loops: Animation.Infinite
                running: true
                NumberAnimation { from: 0.90; to: root.isWorking ? 1.24 : 1.12; duration: root.isWorking ? 650 : 1500; easing.type: Easing.InOutQuad }
                NumberAnimation { from: root.isWorking ? 1.24 : 1.12; to: 0.90; duration: root.isWorking ? 650 : 1500; easing.type: Easing.InOutQuad }
            }

            // Myk rotasjon når Arbeidsmauren jobber i bakgrunnen
            NumberAnimation on rotation {
                running: root.isWorking
                from: 0
                to: 360
                duration: 3200
                loops: Animation.Infinite
            }
        }
    }
}
