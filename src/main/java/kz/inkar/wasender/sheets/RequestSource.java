package kz.inkar.wasender.sheets;

import java.util.List;

public interface RequestSource {

    List<SheetRow> readRows();

    void write(List<CellWrite> writes);
}
