import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes

Rectangle {
    id: keyboardRoot

    // Teksten som redigeres
    property string textValue: ""
    property bool active: false

    // Automatisk stor forbokstav når feltet er tomt eller etter mellomrom/bindestrek
    property bool shiftOverride: false
    readonly property bool isUppercase: shiftOverride
        || textValue.length === 0
        || textValue.endsWith(" ")
        || textValue.endsWith("-")

    signal doneClicked()

    function appendChar(ch) {
        const out = isUppercase ? ch.toUpperCase() : ch.toLowerCase();
        textValue = textValue + out;
        shiftOverride = false;
    }

    function backspace() {
        if (textValue.length > 0) {
            textValue = textValue.slice(0, textValue.length - 1);
        }
        shiftOverride = false;
    }

    visible: active
    radius: 14
    color: "#E8DFF5"
    border.color: "#D3C4EA"
    border.width: 1
    implicitHeight: kbLayout.implicitHeight + 16

    readonly property var row1: ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Å"]
    readonly property var row2: ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ø", "Æ"]
    readonly property var row3: ["Z", "X", "C", "V", "B", "N", "M"]

    ColumnLayout {
        id: kbLayout
        anchors.fill: parent
        anchors.margins: 8
        spacing: 6

        // Rad 1: Q - Å
        RowLayout {
            Layout.fillWidth: true
            spacing: 4

            Repeater {
                model: keyboardRoot.row1
                delegate: Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredWidth: 1
                    height: 38
                    radius: 8
                    color: keyArea1.pressed ? "#CFC0E8" : "#FFFFFF"
                    border.color: "#D8CEE8"
                    border.width: 1

                    Text {
                        anchors.centerIn: parent
                        text: keyboardRoot.isUppercase ? modelData : modelData.toLowerCase()
                        font.pixelSize: 16
                        font.weight: Font.DemiBold
                        color: "#171719"
                    }

                    MouseArea {
                        id: keyArea1
                        anchors.fill: parent
                        onClicked: keyboardRoot.appendChar(modelData)
                    }
                }
            }
        }

        // Rad 2: A - Æ
        RowLayout {
            Layout.fillWidth: true
            spacing: 4

            Repeater {
                model: keyboardRoot.row2
                delegate: Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredWidth: 1
                    height: 38
                    radius: 8
                    color: keyArea2.pressed ? "#CFC0E8" : "#FFFFFF"
                    border.color: "#D8CEE8"
                    border.width: 1

                    Text {
                        anchors.centerIn: parent
                        text: keyboardRoot.isUppercase ? modelData : modelData.toLowerCase()
                        font.pixelSize: 16
                        font.weight: Font.DemiBold
                        color: "#171719"
                    }

                    MouseArea {
                        id: keyArea2
                        anchors.fill: parent
                        onClicked: keyboardRoot.appendChar(modelData)
                    }
                }
            }
        }

        // Rad 3: Shift + Z - M + Backspace
        RowLayout {
            Layout.fillWidth: true
            spacing: 4

            // Shift-knapp (vektorpil opp)
            Rectangle {
                Layout.preferredWidth: 40
                height: 38
                radius: 8
                color: keyboardRoot.isUppercase ? "#7C65A9" : (shiftArea.pressed ? "#CFC0E8" : "#F5F1FA")
                border.color: keyboardRoot.isUppercase ? "#7C65A9" : "#D8CEE8"
                border.width: 1

                Shape {
                    anchors.centerIn: parent
                    width: 16
                    height: 16
                    layer.enabled: true
                    layer.samples: 4

                    ShapePath {
                        strokeColor: keyboardRoot.isUppercase ? "#FFFFFF" : "#3E325C"
                        strokeWidth: 2
                        fillColor: "transparent"
                        capStyle: ShapePath.RoundCap
                        joinStyle: ShapePath.RoundJoin
                        PathSvg {
                            path: "M 8 2 L 14 9 L 10.5 9 L 10.5 14 L 5.5 14 L 5.5 9 L 2 9 Z"
                        }
                    }
                }

                MouseArea {
                    id: shiftArea
                    anchors.fill: parent
                    onClicked: keyboardRoot.shiftOverride = !keyboardRoot.shiftOverride
                }
            }

            Repeater {
                model: keyboardRoot.row3
                delegate: Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredWidth: 1
                    height: 38
                    radius: 8
                    color: keyArea3.pressed ? "#CFC0E8" : "#FFFFFF"
                    border.color: "#D8CEE8"
                    border.width: 1

                    Text {
                        anchors.centerIn: parent
                        text: keyboardRoot.isUppercase ? modelData : modelData.toLowerCase()
                        font.pixelSize: 16
                        font.weight: Font.DemiBold
                        color: "#171719"
                    }

                    MouseArea {
                        id: keyArea3
                        anchors.fill: parent
                        onClicked: keyboardRoot.appendChar(modelData)
                    }
                }
            }

            // Backspace-knapp (vektorikon)
            Rectangle {
                Layout.preferredWidth: 46
                height: 38
                radius: 8
                color: bsArea.pressed ? "#CFC0E8" : "#F5F1FA"
                border.color: "#D8CEE8"
                border.width: 1

                Shape {
                    anchors.centerIn: parent
                    width: 20
                    height: 16
                    layer.enabled: true
                    layer.samples: 4

                    ShapePath {
                        strokeColor: "#3E325C"
                        strokeWidth: 1.8
                        fillColor: "transparent"
                        capStyle: ShapePath.RoundCap
                        joinStyle: ShapePath.RoundJoin
                        PathSvg {
                            path: "M 7 2 L 18 2 L 18 14 L 7 14 L 2 8 Z M 10 5.5 L 15 10.5 M 15 5.5 L 10 10.5"
                        }
                    }
                }

                MouseArea {
                    id: bsArea
                    anchors.fill: parent
                    onClicked: keyboardRoot.backspace()
                }
            }
        }

        // Rad 4: Bindestrek + Mellomrom + Ferdig
        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            Rectangle {
                Layout.preferredWidth: 44
                height: 36
                radius: 8
                color: dashArea.pressed ? "#CFC0E8" : "#FFFFFF"
                border.color: "#D8CEE8"
                border.width: 1

                Text {
                    anchors.centerIn: parent
                    text: "-"
                    font.pixelSize: 18
                    font.weight: Font.Bold
                    color: "#3E325C"
                }

                MouseArea {
                    id: dashArea
                    anchors.fill: parent
                    onClicked: keyboardRoot.appendChar("-")
                }
            }

            Rectangle {
                Layout.fillWidth: true
                height: 36
                radius: 8
                color: spaceArea.pressed ? "#CFC0E8" : "#FFFFFF"
                border.color: "#D8CEE8"
                border.width: 1

                Text {
                    anchors.centerIn: parent
                    text: "Mellomrom"
                    font.pixelSize: 13
                    font.weight: Font.Medium
                    color: "#5D5373"
                }

                MouseArea {
                    id: spaceArea
                    anchors.fill: parent
                    onClicked: keyboardRoot.appendChar(" ")
                }
            }

            Rectangle {
                Layout.preferredWidth: 74
                height: 36
                radius: 8
                color: doneArea.pressed ? "#685296" : "#7C65A9"

                Text {
                    anchors.centerIn: parent
                    text: "Ferdig"
                    font.pixelSize: 13
                    font.weight: Font.DemiBold
                    color: "#FFFFFF"
                }

                MouseArea {
                    id: doneArea
                    anchors.fill: parent
                    onClicked: {
                        keyboardRoot.active = false;
                        keyboardRoot.doneClicked();
                    }
                }
            }
        }
    }
}
