package kz.inkar.wasender.sheets;

import kz.inkar.wasender.config.SheetsProperties;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ColumnLayoutTest {

    @Test
    void convertsBetweenLettersAndIndexes() {
        assertThat(ColumnLayout.toIndex("A")).isZero();
        assertThat(ColumnLayout.toIndex("z")).isEqualTo(25);
        assertThat(ColumnLayout.toIndex("AA")).isEqualTo(26);
        assertThat(ColumnLayout.toLetter(0)).isEqualTo("A");
        assertThat(ColumnLayout.toLetter(26)).isEqualTo("AA");
        assertThat(ColumnLayout.toLetter(ColumnLayout.toIndex("BC"))).isEqualTo("BC");
        assertThatThrownBy(() -> ColumnLayout.toIndex("A1")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void columnOrderComesFromConfig() {
        var layout = new ColumnLayout(new SheetsProperties.Columns("K", "A", "B", "C", "D", "E", "F", "G", "H"));

        assertThat(layout.index(SheetField.ID)).isEqualTo(10);
        assertThat(layout.letter(SheetField.ROUTE)).isEqualTo("A");
        assertThat(layout.lastLetter()).isEqualTo("K");
    }
}
