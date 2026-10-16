import QtQuick
import QtQuick.Shapes

Item {
    id: root

    property string centerColor: "#D2BEE9"
    property string outerColor: "#FAF9F6"
    property int pulseSpeedMs: 2800
    property bool isListening: false
    property bool isSpeaking: false

    implicitWidth: 440
    implicitHeight: 440

    readonly property real centerX: width / 2
    readonly property real centerY: height / 2

    // Bakgrunnsaura: stor sirkel med lang, gradvis og myk blur helt ut til 300px
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
                from: 0.92
                to: 1.0
                duration: root.pulseSpeedMs / 2
                easing.type: Easing.InOutSine
            }
            NumberAnimation {
                from: 1.0
                to: 0.92
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
                    centerRadius: auraContainer.width / 2
                    focalX: auraContainer.width / 2
                    focalY: auraContainer.height / 2

                    // Bredere kjerne og kortere blur slik at auraen framstår mer definert
                    GradientStop {
                        position: 0.0
                        color: root.centerColor
                        Behavior on color { ColorAnimation { duration: 400 } }
                    }
                    GradientStop {
                        position: 0.56
                        color: root.centerColor
                        Behavior on color { ColorAnimation { duration: 400 } }
                    }
                    GradientStop {
                        position: 0.68
                        color: Qt.rgba(0.83, 0.75, 0.92, 0.85)
                    }
                    GradientStop {
                        position: 0.78
                        color: Qt.rgba(0.88, 0.82, 0.94, 0.48)
                    }
                    GradientStop {
                        position: 0.88
                        color: Qt.rgba(0.94, 0.90, 0.97, 0.12)
                    }
                    GradientStop {
                        position: 0.96
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

    // Josefines fjes (øyne, smil og stjernestøv bevares eksakt på plass)
    Item {
        id: faceContainer
        anchors.fill: parent
        scale: 1.18
        transformOrigin: Item.Center

        // Venstre øye (alltid sentrert uavhengig av aurastørrelse)
        Rectangle {
            id: leftEye
            width: 21
            height: 21
            radius: 10.5
            color: "#171719"
            x: root.centerX - 67.5
            y: root.centerY - 15.5
            transformOrigin: Item.Center

            scale: root.isListening ? 1.15 : 1.0
            Behavior on scale { NumberAnimation { duration: 200 } }
        }

        // Høyre øye (alltid sentrert uavhengig av aurastørrelse)
        Rectangle {
            id: rightEye
            width: 21
            height: 21
            radius: 10.5
            color: "#171719"
            x: root.centerX + 45.5
            y: root.centerY - 15.5
            transformOrigin: Item.Center

            scale: root.isListening ? 1.15 : 1.0
            Behavior on scale { NumberAnimation { duration: 200 } }
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
                NumberAnimation { target: leftEye; property: "scale"; to: root.isListening ? 1.15 : 1.0; duration: 100; easing.type: Easing.OutQuad }
                NumberAnimation { target: rightEye; property: "scale"; to: root.isListening ? 1.15 : 1.0; duration: 100; easing.type: Easing.OutQuad }
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

        // Smil (myk bue sentrert mellom øynene)
        Shape {
            id: mouth
            width: 24
            height: 14
            x: root.centerX - 12
            y: root.centerY + 22

            ShapePath {
                strokeColor: "#171719"
                strokeWidth: 3.8
                fillColor: "transparent"
                capStyle: ShapePath.RoundCap
                joinStyle: ShapePath.RoundJoin

                startX: 1
                startY: 1
                PathQuad {
                    x: 23
                    y: 1
                    controlX: 12
                    controlY: root.isSpeaking ? 16 : 11
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

        // Magisk 4-tagget stjerne (✦) ved øvre høyre kant av fjeset
        Item {
            id: sparkle
            x: root.centerX + 65.5
            y: root.centerY - 67.5
            width: 24
            height: 24
            transformOrigin: Item.Center

            Shape {
                anchors.fill: parent
                ShapePath {
                    fillColor: "#171719"
                    strokeColor: "#171719"
                    strokeWidth: 0.5
                    startX: 12
                    startY: 1
                    PathQuad { x: 23; y: 12; controlX: 12; controlY: 12 }
                    PathQuad { x: 12; y: 23; controlX: 12; controlY: 12 }
                    PathQuad { x: 1;  y: 12; controlX: 12; controlY: 12 }
                    PathQuad { x: 12; y: 1;  controlX: 12; controlY: 12 }
                }
            }

            // Subtil glitre-animasjon
            SequentialAnimation on scale {
                loops: Animation.Infinite
                running: true
                NumberAnimation { from: 0.92; to: 1.15; duration: 1500; easing.type: Easing.InOutQuad }
                NumberAnimation { from: 1.15; to: 0.92; duration: 1500; easing.type: Easing.InOutQuad }
            }
        }
    }
}
